// Regras de pagamento sem dependências externas (fáceis de testar com `npm test`).

// M-Pesa / e-Mola: tempo que o cliente tem para aprovar o pedido no telemóvel.
export const MOBILE_TIMEOUT_SECONDS = 120;
// Visa Card: igual ao `expires_at` (1 h) enviado ao gateway ao criar o checkout.
export const CARD_TIMEOUT_SECONDS = 60 * 60;

// Prefixos nacionais por operadora (9 dígitos, sem 258).
export const OPERATOR_PREFIXES = { mpesa: ['84', '85'], emola: ['86', '87'] };

export const isMobileMethod = (method) => method === 'mpesa' || method === 'emola';
export const timeoutFor = (method) => (isMobileMethod(method) ? MOBILE_TIMEOUT_SECONDS : CARD_TIMEOUT_SECONDS);

// `national` = 9 dígitos sem o 258. Métodos que não usam número de telemóvel aceitam tudo.
export function phoneFitsMethod(method, national) {
  if (!isMobileMethod(method)) return true;
  return OPERATOR_PREFIXES[method].some((p) => String(national).startsWith(p));
}

export const isTerminal = (status) => ['succeeded', 'failed', 'refunded', 'cancelled'].includes(status);

// Que mudanças de estado de uma transação são permitidas.
// - Enquanto pendente pode ir para qualquer estado.
// - Falhada/cancelada (ex.: expirou) só pode ainda passar a paga (o cliente aprovou tarde) ou reembolsada.
// - Paga só pode passar a reembolsada. Reembolsada é final.
export function canTransition(from, to) {
  if (from === to) return false;
  if (!isTerminal(from)) return true;
  if (from === 'failed' || from === 'cancelled') return to === 'succeeded' || to === 'refunded';
  if (from === 'succeeded') return to === 'refunded';
  return false;
}

// Resultado que o site mostra ao cliente.
// paid | declined | expired | cancelled | refunded | pending
export function outcomeOf({ transactionStatus, paymentStatus, failureCode }) {
  const s = transactionStatus || paymentStatus;
  if (s === 'succeeded' || s === 'paid') return 'paid';
  if (s === 'refunded') return 'refunded';
  if (s === 'failed') return 'declined';
  if (s === 'cancelled') return failureCode === 'timeout' ? 'expired' : 'cancelled';
  return 'pending';
}
