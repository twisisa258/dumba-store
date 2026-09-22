import { API_URL } from './config.js';

export class ApiError extends Error {
  constructor(code, message, fields) {
    super(message);
    this.code = code;
    this.fields = fields || {};
  }
}

// A sessão do admin viaja num cabeçalho Authorization (o cookie não funciona entre a Vercel e o Render).
const TOKEN_KEY = 'dumba_admin_token';
export const getAdminToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setAdminToken = (token) => {
  try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignora */ }
};

export async function api(path, { method = 'GET', body, lang = 'pt' } = {}) {
  if (!API_URL) throw new ApiError('config', 'config');
  const isAdmin = path.startsWith('/admin');
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = isAdmin ? getAdminToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_URL}/api${path}${sep}lang=${lang}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    // Normalmente: VITE_API_URL errado, API adormecida/em baixo, ou CORS_ORIGINS sem o endereço deste site.
    console.error('[dumba] sem resposta da API:', url, e);
    throw new ApiError('network', 'network');
  }
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem JSON */ }

  if (res.status === 401 && isAdmin && path !== '/admin/login') {
    setAdminToken(null);
    window.dispatchEvent(new Event('dumba:admin-unauthorized'));
  }
  if (!res.ok) throw new ApiError(data?.error || 'server', data?.message || 'server', data?.fields);
  if (data === null) {
    // 200 sem JSON = o endereço da API aponta para outra coisa (ex.: o próprio site).
    console.error('[dumba] a resposta de', url, 'não é JSON. Confirme VITE_API_URL.');
    throw new ApiError('bad_response', 'bad_response');
  }
  return data;
}
