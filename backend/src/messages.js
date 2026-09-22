export const messages = {
  pt: {
    required: 'Campo obrigatório.',
    name_short: 'Escreva o seu nome completo.',
    invalid_phone: 'Número inválido. Ex.: 84 123 4567.',
    invalid_email: 'E-mail inválido.',
    address_short: 'Indique bairro, rua e ponto de referência.',
    city_required: 'Escolha a cidade.',
    message_short: 'Escreva pelo menos 10 caracteres.',
    invalid_payment: 'Escolha um método de pagamento.',
    items_empty: 'O carrinho está vazio.',
    product_not_found: 'Um dos produtos já não está disponível.',
    out_of_stock: 'Sem stock suficiente de "{name}".',
    too_many_requests: 'Muitos pedidos seguidos. Tente novamente daqui a pouco.',
    server_error: 'Algo correu mal do nosso lado. Tente novamente.',
    not_found: 'Não encontrado.',
    invalid: 'Valor inválido.',
    variant_required: 'Escolha uma opção do produto antes de finalizar o pedido.',
    payment_start_failed: 'Não foi possível iniciar o pagamento. O pedido não foi cobrado nem reservado. Tente novamente ou escolha outro método.',
    payment_phone_required: 'Indique o número que vai pagar.',
    invoice_not_paid: 'A fatura só fica disponível depois de o pagamento ser confirmado.',
    phone_not_mpesa: 'O M-Pesa funciona com números Vodacom (84 ou 85).',
    phone_not_emola: 'O e-Mola funciona com números Movitel (86 ou 87).',
  },
  en: {
    required: 'This field is required.',
    name_short: 'Please enter your full name.',
    invalid_phone: 'Invalid number. E.g. 84 123 4567.',
    invalid_email: 'Invalid e-mail.',
    address_short: 'Add neighbourhood, street and a landmark.',
    city_required: 'Please choose a city.',
    message_short: 'Write at least 10 characters.',
    invalid_payment: 'Choose a payment method.',
    items_empty: 'Your cart is empty.',
    product_not_found: 'One of the products is no longer available.',
    out_of_stock: 'Not enough stock for "{name}".',
    too_many_requests: 'Too many requests. Please try again shortly.',
    server_error: 'Something went wrong on our side. Please try again.',
    not_found: 'Not found.',
    invalid: 'Invalid value.',
    variant_required: 'Choose a product option before completing the order.',
    payment_start_failed: 'We could not start the payment. Nothing was charged or reserved. Please try again or choose another method.',
    payment_phone_required: 'Enter the number that will pay.',
    invoice_not_paid: 'The invoice is only available once the payment is confirmed.',
    phone_not_mpesa: 'M-Pesa works with Vodacom numbers (84 or 85).',
    phone_not_emola: 'e-Mola works with Movitel numbers (86 or 87).',
  },
};

export function getLang(req) {
  const q = String(req.query?.lang || req.body?.lang || '').slice(0, 2).toLowerCase();
  if (q === 'pt' || q === 'en') return q;
  const h = String(req.headers['accept-language'] || '').toLowerCase();
  return h.startsWith('en') ? 'en' : 'pt';
}

export function t(lang, key, vars = {}) {
  const dict = messages[lang] || messages.pt;
  const text = dict[key] ?? dict.invalid;
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
