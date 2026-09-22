// Em produção o endereço da API TEM de vir de VITE_API_URL (definido na Vercel, antes do build).
// Sem isso, o site tentaria falar com "localhost" — que, no telemóvel do cliente, é o próprio telemóvel.
let raw = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')).trim();
if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
if (!raw) console.error('[dumba] VITE_API_URL não está definido neste build. Defina-o na Vercel e faça um novo deploy.');

export const API_URL = raw.replace(/\/$/, '');
export const WHATSAPP = (import.meta.env.VITE_WHATSAPP || '').replace(/\D/g, '');
export const CITIES = ['Maputo', 'Matola', 'Beira', 'Nampula', 'Other'];
