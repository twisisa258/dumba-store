import crypto from 'node:crypto';

// Valores colados nas variáveis de ambiente chegam muitas vezes com espaço/quebra de linha no fim
// ou entre aspas ("assim"). O Render não retira as aspas. Isto normaliza.
export function cleanEnv(value) {
  let s = String(value ?? '').trim();
  const quoted = s.match(/^(["'])([\s\S]*)\1$/);
  if (quoted) s = quoted[2].trim();
  return s;
}

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
// Comparação em tempo constante (os hashes têm sempre o mesmo tamanho).
export const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

// O teclado do telemóvel costuma pôr maiúscula na primeira letra e um espaço no fim:
// o utilizador compara-se sem maiúsculas/espaços; a palavra-passe sem espaços nas pontas.
export function checkAdminCredentials(input, env) {
  const wantUser = cleanEnv(env.ADMIN_USERNAME);
  const rawPass = String(env.ADMIN_PASSWORD ?? '').trim();
  const wantPass = cleanEnv(env.ADMIN_PASSWORD);
  const user = String(input?.username ?? '').trim();
  const pass = String(input?.password ?? '').trim();
  const userOk = safeEqual(user.toLowerCase(), wantUser.toLowerCase());
  // Aceita tanto a palavra-passe limpa como a versão com as aspas (caso façam parte dela).
  const passOk = safeEqual(pass, wantPass) || safeEqual(pass, rawPass);
  return { ok: userOk && passOk && Boolean(wantUser) && Boolean(wantPass), userOk, passOk };
}

// Nomes das variáveis ADMIN_* que tinham espaços/aspas nas pontas (nunca os valores).
export function dirtyAdminEnv(env) {
  return ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET']
    .filter((n) => env[n] !== undefined && String(env[n]) !== cleanEnv(env[n]));
}
