const PHONE = /^8[2-7]\d{7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const digitsOnly = (v) => v.replace(/\D/g, '').replace(/^258/, '').slice(0, 9);
export const formatPhone = (d) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(' ');
export const isEmail = (v) => EMAIL.test(v.trim());

// Operadora de cada método (prefixos nacionais). Igual ao backend (payment-rules.js).
export const OPERATOR_PREFIXES = { mpesa: ['84', '85'], emola: ['86', '87'] };
export const isMobileMethod = (m) => m === 'mpesa' || m === 'emola';
export const phoneFitsMethod = (method, digits) =>
  !isMobileMethod(method) || OPERATOR_PREFIXES[method].some((p) => String(digits).startsWith(p));

export function validateCheckout(v, t) {
  const e = {};
  if (v.name.trim().length < 3) e.name = t('err.name_short');
  if (!PHONE.test(v.phone)) e.phone = t('err.invalid_phone');
  if (!v.city) e.city = t('err.city_required');
  if (v.address.trim().length < 8) e.address = t('err.address_short');
  return e;
}

// Etapa "Pagamento": M-Pesa/e-Mola precisam do número que vai aprovar o pedido.
export function validatePayment(v, t) {
  const e = {};
  if (isMobileMethod(v.paymentMethod)) {
    if (!v.payPhone) e.payPhone = t('co.pay.required');
    else if (!PHONE.test(v.payPhone)) e.payPhone = t('err.invalid_phone');
    else if (!phoneFitsMethod(v.paymentMethod, v.payPhone)) e.payPhone = t(`co.pay.prefix.${v.paymentMethod}`);
  }
  return e;
}

export function validateContact(v, t) {
  const e = {};
  if (v.name.trim().length < 2) e.name = t('err.name_short');
  if (!isEmail(v.email)) e.email = t('err.invalid_email');
  if (v.message.trim().length < 10) e.message = t('err.message_short');
  return e;
}
