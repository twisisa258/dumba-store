import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Fatura / comprovativo de pagamento em PDF (A4). Só usa fontes padrão do PDF (Latin-1: acentos ok).

const TXT = {
  pt: {
    title: 'FATURA', sub: 'Comprovativo de pagamento', no: 'N.º', paidOn: 'Pago em', paid: 'PAGO',
    customer: 'Cliente', delivery: 'Entrega', desc: 'Descrição', qty: 'Qtd', unit: 'Preço unit.', total: 'Total',
    base: 'Base tributável', vat: 'IVA incluído ({rate}%)', grand: 'Total pago',
    payment: 'Pagamento', method: 'Método', reference: 'Referência', nuit: 'NUIT', tel: 'Tel.',
    footer: 'Comprovativo de pagamento emitido eletronicamente. Obrigado pela sua compra!',
    methods: { mpesa: 'M-Pesa', emola: 'e-Mola', visa_card: 'Cartão Visa' },
  },
  en: {
    title: 'INVOICE', sub: 'Proof of payment', no: 'No.', paidOn: 'Paid on', paid: 'PAID',
    customer: 'Customer', delivery: 'Delivery', desc: 'Description', qty: 'Qty', unit: 'Unit price', total: 'Total',
    base: 'Taxable base', vat: 'VAT included ({rate}%)', grand: 'Total paid',
    payment: 'Payment', method: 'Method', reference: 'Reference', nuit: 'Tax ID (NUIT)', tel: 'Tel.',
    footer: 'Proof of payment issued electronically. Thank you for your purchase!',
    methods: { mpesa: 'M-Pesa', emola: 'e-Mola', visa_card: 'Visa card' },
  },
};

const RED = rgb(0.945, 0.11, 0.18);
const INK = rgb(0.09, 0.1, 0.12);
const GREY = rgb(0.45, 0.47, 0.5);
const LINE = rgb(0.88, 0.89, 0.91);
const SOFT = rgb(0.96, 0.96, 0.97);
const GREEN = rgb(0.08, 0.48, 0.26);

// 5000 -> "5 000,00 MT"
export const formatMoney = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},00 MT`;

// dd/mm/aaaa hh:mm, na hora de Maputo.
export function formatDate(value) {
  const d = value ? new Date(value) : new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Africa/Maputo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

// 258841234567 -> "+258 84 123 4567"
export function formatPhone(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  const m = d.match(/^(258)(\d{2})(\d{3})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (d ? `+${d}` : '');
}

async function loadLogo(doc) {
  try {
    return await doc.embedPng(await readFile(new URL('../assets/logo.png', import.meta.url)));
  } catch { return null; }
}

// order: { code, customer_name, phone, city, address, payment_method, total_mzn, paid_at, created_at, reference }
// items: [{ qty, unit_price_mzn, name, variant }]   shop: { name, nuit, address, phone, email, vatRate }
export async function buildInvoicePdf({ order, items, shop, lang = 'pt' }) {
  const L = TXT[lang] || TXT.pt;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(doc);
  const allowed = new Set(regular.getCharacterSet());
  // Emojis e alfabetos fora de Latin-1 não existem nas fontes padrão: trocam-se por "?" em vez de falhar.
  const clean = (s) => Array.from(String(s ?? '').replace(/[\r\n\t]+/g, ' ')).map((c) => (allowed.has(c.codePointAt(0)) ? c : '?')).join('');

  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]);
  const text = (s, x, y, { size = 10, font = regular, color = INK, right = false } = {}) => {
    const t = clean(s);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: right ? x - w : x, y, size, font, color });
  };
  const wrap = (s, font, size, maxW) => {
    const words = clean(s).split(' ').filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxW) cur = next;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  // Cabeçalho escuro com o logo (como o site).
  page.drawRectangle({ x: 0, y: H - 104, width: W, height: 104, color: rgb(0.02, 0.024, 0.03) });
  page.drawRectangle({ x: 0, y: H - 108, width: W, height: 4, color: RED });
  if (logo) {
    const h = 40; const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M, y: H - 72, width: w, height: h });
  } else {
    text(shop.name, M, H - 66, { size: 24, font: bold, color: rgb(1, 1, 1) });
  }
  text(L.title, W - M, H - 56, { size: 24, font: bold, color: rgb(1, 1, 1), right: true });
  text(L.sub, W - M, H - 74, { size: 9.5, color: rgb(0.7, 0.72, 0.75), right: true });

  // Dados da loja (esquerda) e do documento (direita).
  let y = H - 140;
  text(shop.name, M, y, { size: 12, font: bold });
  const shopLines = [
    shop.nuit && `${L.nuit}: ${shop.nuit}`, shop.address, [shop.phone && `${L.tel} ${shop.phone}`, shop.email].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  shopLines.forEach((l, i) => text(l, M, y - 15 - i * 12, { size: 9, color: GREY }));

  text(`${L.no} ${order.code}`, W - M, y, { size: 12, font: bold, right: true });
  text(`${L.paidOn}: ${formatDate(order.paid_at || order.created_at)}`, W - M, y - 15, { size: 9, color: GREY, right: true });
  const badgeW = bold.widthOfTextAtSize(L.paid, 9) + 18;
  page.drawRectangle({ x: W - M - badgeW, y: y - 42, width: badgeW, height: 18, color: rgb(0.91, 0.97, 0.94), borderColor: GREEN, borderWidth: 0.8 });
  text(L.paid, W - M - badgeW / 2 - bold.widthOfTextAtSize(L.paid, 9) / 2, y - 36.5, { size: 9, font: bold, color: GREEN });

  // Cliente.
  y -= 84;
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0.8, color: LINE });
  text(L.customer.toUpperCase(), M, y, { size: 8, font: bold, color: GREY });
  text(order.customer_name, M, y - 15, { size: 11, font: bold });
  text(formatPhone(order.phone), M, y - 29, { size: 9.5, color: GREY });
  text(L.delivery.toUpperCase(), W / 2 + 10, y, { size: 8, font: bold, color: GREY });
  const addr = wrap(`${order.address}, ${order.city}`, regular, 9.5, W / 2 - M - 10);
  addr.slice(0, 3).forEach((l, i) => text(l, W / 2 + 10, y - 15 - i * 12, { size: 9.5 }));

  // Tabela de artigos.
  y -= 66;
  const cols = { desc: M + 10, qty: 350, unit: 450, total: W - M - 10 };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: SOFT });
    text(L.desc, cols.desc, y, { size: 8.5, font: bold, color: GREY });
    text(L.qty, cols.qty, y, { size: 8.5, font: bold, color: GREY, right: true });
    text(L.unit, cols.unit, y, { size: 8.5, font: bold, color: GREY, right: true });
    text(L.total, cols.total, y, { size: 8.5, font: bold, color: GREY, right: true });
    y -= 26;
  };
  header();
  for (const it of items) {
    const label = it.variant ? `${it.name} · ${it.variant}` : it.name;
    const lines = wrap(label, regular, 10, cols.qty - cols.desc - 50);
    const need = lines.length * 13 + 12;
    if (y - need < 130) { page = doc.addPage([W, H]); y = H - 60; header(); }
    lines.forEach((l, i) => text(l, cols.desc, y - i * 13, { size: 10 }));
    text(String(it.qty), cols.qty, y, { size: 10, right: true });
    text(formatMoney(it.unit_price_mzn), cols.unit, y, { size: 10, right: true });
    text(formatMoney(it.qty * it.unit_price_mzn), cols.total, y, { size: 10, font: bold, right: true });
    y -= need - 4;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: LINE });
    y -= 6;
  }

  // Totais (o preço da loja já é o total pago; o IVA, se configurado, é mostrado como incluído).
  if (y < 190) { page = doc.addPage([W, H]); y = H - 60; }
  y -= 12;
  const total = Number(order.total_mzn) || 0;
  if (shop.vatRate > 0) {
    const base = total / (1 + shop.vatRate / 100);
    const labelX = W - M - 110;
    text(L.base, labelX, y, { size: 9.5, color: GREY, right: true });
    text(formatMoney(base), cols.total, y, { size: 9.5, right: true });
    y -= 16;
    text(L.vat.replace('{rate}', String(shop.vatRate)), labelX, y, { size: 9.5, color: GREY, right: true });
    text(formatMoney(total - base), cols.total, y, { size: 9.5, right: true });
    y -= 40;
  } else {
    y -= 12;
  }
  page.drawRectangle({ x: W - M - 230, y: y - 10, width: 230, height: 34, color: rgb(0.02, 0.024, 0.03) });
  text(L.grand, W - M - 218, y + 2, { size: 10, color: rgb(0.75, 0.77, 0.8) });
  text(formatMoney(total), W - M - 12, y + 1, { size: 14, font: bold, color: rgb(1, 1, 1), right: true });

  // Pagamento.
  y -= 52;
  text(L.payment.toUpperCase(), M, y, { size: 8, font: bold, color: GREY });
  text(`${L.method}: ${L.methods[order.payment_method] || order.payment_method}`, M, y - 15, { size: 10 });
  if (order.reference) text(`${L.reference}: ${order.reference}`, M, y - 29, { size: 10 });

  // Rodapé em todas as páginas.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.5, color: LINE });
    text(L.footer, M, 30, { size: 8, color: GREY });
    text(`${i + 1}/${pages.length}`, W - M, 30, { size: 8, color: GREY, right: true });
  });

  doc.setTitle(`${L.title} ${order.code}`);
  doc.setProducer('Dumba');
  return doc.save();
}
