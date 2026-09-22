import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildInvoicePdf, formatMoney, formatPhone } from '../src/invoice.js';

const order = { code: 'DMB-ABC234', customer_name: 'Maria 😀 Ольга', phone: '258841234567', city: 'Maputo', address: 'Bairro Central, Rua 1', payment_method: 'mpesa', total_mzn: 5000, paid_at: '2026-09-21T13:45:00Z', reference: 'ZP-1' };
const items = [{ qty: 2, unit_price_mzn: 2500, name: 'Smartphone', variant: 'Preto' }];

test('formatos de dinheiro e telefone', () => {
  assert.equal(formatMoney(5000), '5 000,00 MT');
  assert.equal(formatMoney(1234567), '1 234 567,00 MT');
  assert.equal(formatPhone('258841234567'), '+258 84 123 4567');
});

test('gera um PDF válido mesmo com emojis/alfabetos que as fontes padrão não têm', async () => {
  const pdf = await buildInvoicePdf({ order, items, shop: { name: 'Dumba', vatRate: 0 }, lang: 'pt' });
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

test('inglês e IVA incluído também geram PDF', async () => {
  const pdf = await buildInvoicePdf({ order, items, shop: { name: 'Dumba', nuit: '400123456', vatRate: 16 }, lang: 'en' });
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
});

test('muitos artigos passam para uma segunda página', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ qty: 1, unit_price_mzn: 100, name: `Produto ${i + 1}`, variant: null }));
  const pdf = await buildInvoicePdf({ order: { ...order, total_mzn: 3000 }, items: many, shop: { name: 'Dumba', vatRate: 0 } });
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 2);
});
