import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, query } from './db.js';
import { getLang, t } from './messages.js';
import { orderSchema, contactSchema, newsletterSchema, validate } from './validators.js';
import { MOBILE_TIMEOUT_SECONDS, CARD_TIMEOUT_SECONDS, isMobileMethod, timeoutFor, outcomeOf, canTransition } from './payment-rules.js';
import { checkAdminCredentials, cleanEnv, dirtyAdminEnv } from './admin-auth.js';
import { buildInvoicePdf } from './invoice.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const mapVariant = (r) => ({
  id: r.id,
  name: { pt: r.name_pt, en: r.name_en },
  color: r.color,
  stock: r.stock,
  image: r.image_url,
});

const mapProduct = (r) => ({
  id: r.id,
  slug: r.slug,
  category: r.category,
  name: { pt: r.name_pt, en: r.name_en },
  description: { pt: r.description_pt, en: r.description_en },
  price: r.price_mzn,
  stock: r.stock,
  image: r.image_url,
  variants: Array.isArray(r.variants) ? r.variants.map(mapVariant) : [],
});

const PRODUCT_SELECT = `
  p.*,
  coalesce((
    select json_agg(json_build_object(
      'id', v.id,
      'name_pt', v.name_pt,
      'name_en', v.name_en,
      'color', v.color,
      'stock', v.stock,
      'image_url', v.image_url
    ) order by v.id)
    from product_variants v
    where v.product_id = p.id and v.active
  ), '[]'::json) as variants
`;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'DMB-' + Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

const validationError = (res, lang, fields) => res.status(400).json({ error: 'validation', message: t(lang, 'invalid'), fields });

function adminPayload() {
  return {
    username: cleanEnv(process.env.ADMIN_USERNAME),
    password: cleanEnv(process.env.ADMIN_PASSWORD),
    secret: cleanEnv(process.env.ADMIN_SESSION_SECRET),
  };
}

const dirtyAdmin = dirtyAdminEnv(process.env);
if (dirtyAdmin.length) console.warn(`[config] ${dirtyAdmin.join(', ')} tinha espaços/aspas nas pontas — foram ignorados. Confirme o valor no Render.`);

function signAdminSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', adminPayload().secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAdminSession(token) {
  if (!token || !adminPayload().secret) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', adminPayload().secret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p?.role === 'admin' && p?.exp > Date.now();
  } catch { return false; }
}

// A sessão viaja no cabeçalho "Authorization: Bearer <token>". Um cookie não serve aqui: o site (Vercel)
// e a API (Render) estão em domínios diferentes e o navegador bloqueia/ignora esse cookie.
function adminTokenFrom(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function requireAdmin(req, res, next) {
  if (!verifyAdminSession(adminTokenFrom(req))) return res.status(401).json({ error: 'unauthorized', message: 'Sessão de administrador inválida.' });
  next();
}

function paymentConfig() {
  return {
    baseUrl: (process.env.ZUMBOPAY_API_URL || 'https://zumbopay.com/api/public/v1').replace(/\/$/, ''),
    apiKey: process.env.ZUMBOPAY_API_KEY,
    merchantId: process.env.ZUMBOPAY_MERCHANT_ID,
    webhookSecret: process.env.ZUMBOPAY_WEBHOOK_SECRET,
    wallets: {
      mpesa: process.env.ZUMBOPAY_WALLET_MPESA,
      emola: process.env.ZUMBOPAY_WALLET_EMOLA,
      card: process.env.ZUMBOPAY_WALLET_CARD,
    },
  };
}

function methodToGateway(method) {
  return method === 'visa_card' ? 'card' : method;
}

function normalizeProviderStatus(value) {
  const s = String(value || '').toLowerCase();
  if (['success', 'succeeded', 'paid', 'completed'].includes(s)) return 'succeeded';
  if (['failed', 'declined', 'error', 'rejected'].includes(s)) return 'failed';
  if (['refunded', 'refund'].includes(s)) return 'refunded';
  if (['cancelled', 'canceled'].includes(s)) return 'cancelled';
  return 'pending';
}

async function zumboRequest(path, { method = 'GET', body, idempotencyKey } = {}) {
  const cfg = paymentConfig();
  if (!cfg.apiKey || !cfg.merchantId) throw new Error('ZumboPay não está configurado.');
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'X-Merchant-Id': cfg.merchantId,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const err = new Error(data?.error?.message || data?.message || `ZumboPay HTTP ${response.status}`);
      err.providerCode = data?.error?.code || `http_${response.status}`;
      err.providerResponse = data;
      err.status = response.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function extractProviderData(data) {
  return data?.data || data || {};
}

async function createNotification({ audience = 'admin', type, title, message, orderId = null, transactionId = null }) {
  await query(
    `insert into notifications (audience,type,title,message,order_id,transaction_id) values ($1,$2,$3,$4,$5,$6)`,
    [audience, type, title, message, orderId, transactionId]
  );
}

async function releaseStockIfNeeded(client, orderId) {
  const r = await client.query(`select id, stock_released_at from orders where id=$1 for update`, [orderId]);
  if (!r.rows[0] || r.rows[0].stock_released_at) return;
  const items = await client.query(`select product_id, variant_id, qty from order_items where order_id=$1`, [orderId]);
  for (const item of items.rows) {
    if (item.variant_id) await client.query('update product_variants set stock = stock + $1 where id=$2', [item.qty, item.variant_id]);
    await client.query('update products set stock = stock + $1 where id=$2', [item.qty, item.product_id]);
  }
  await client.query(`update orders set stock_released_at=now() where id=$1`, [orderId]);
}

// Reserva outra vez o stock de um pedido cujo stock já tinha sido devolvido
// (o cliente aprovou no telemóvel depois de o pedido expirar). Devolve false se já não há stock.
async function reserveStockAgain(client, orderId) {
  const items = (await client.query(`select product_id, variant_id, qty from order_items where order_id=$1`, [orderId])).rows;
  const perProduct = new Map();
  const perVariant = new Map();
  for (const it of items) {
    perProduct.set(it.product_id, (perProduct.get(it.product_id) || 0) + it.qty);
    if (it.variant_id) perVariant.set(it.variant_id, (perVariant.get(it.variant_id) || 0) + it.qty);
  }
  // Mesma ordem de bloqueio que ao criar o pedido (produtos e depois variantes), por id, para evitar deadlocks.
  const pIds = [...perProduct.keys()].sort((a, b) => a - b);
  const vIds = [...perVariant.keys()].sort((a, b) => a - b);
  const pRows = pIds.length ? (await client.query(`select id, stock from products where id = any($1::int[]) order by id for update`, [pIds])).rows : [];
  const vRows = vIds.length ? (await client.query(`select id, stock from product_variants where id = any($1::int[]) order by id for update`, [vIds])).rows : [];
  const enough = pIds.every((id) => (pRows.find((r) => r.id === id)?.stock ?? -1) >= perProduct.get(id))
    && vIds.every((id) => (vRows.find((r) => r.id === id)?.stock ?? -1) >= perVariant.get(id));
  if (!enough) return false;
  for (const [id, qty] of perProduct) await client.query('update products set stock = stock - $1 where id=$2', [qty, id]);
  for (const [id, qty] of perVariant) await client.query('update product_variants set stock = stock - $1 where id=$2', [qty, id]);
  await client.query(`update orders set stock_released_at=null where id=$1`, [orderId]);
  return true;
}

async function applyTransactionStatus(transactionId, nextStatus, details = {}) {
  const client = await pool.connect();
  let notification = null;
  try {
    await client.query('BEGIN');
    const tr = await client.query(`select * from payment_transactions where id=$1 for update`, [transactionId]);
    if (!tr.rows[0]) throw new Error('Transação não encontrada.');
    const tx = tr.rows[0];
    const normalized = normalizeProviderStatus(nextStatus);
    // Não deixa um estado final ser desfeito por eventos atrasados (ex.: "pendente" depois de expirar).
    if (!details.force && !canTransition(tx.status, normalized)) {
      await client.query('COMMIT');
      if (tx.status !== normalized) console.warn(`[pagamento] mudança ignorada ${tx.status} -> ${normalized} (transação ${tx.id})`);
      return tx;
    }
    const ord = (await client.query(`select code, stock_released_at from orders where id=$1 for update`, [tx.order_id])).rows[0];
    const code = ord?.code || String(tx.order_id);
    const paidAt = normalized === 'succeeded' ? 'coalesce(paid_at, now())' : 'paid_at';
    await client.query(
      `update payment_transactions
       set status=$1, provider_reference=coalesce($2, provider_reference), failure_code=$3, failure_message=$4,
           raw_response=coalesce($5::jsonb, raw_response), paid_at=${paidAt}
       where id=$6`,
      [normalized, details.providerReference || null, details.failureCode || null, details.failureMessage || null,
       details.rawResponse ? JSON.stringify(details.rawResponse) : null, transactionId]
    );
    if (normalized === 'succeeded') {
      let orderStatusSql = `case when status='pending' then 'confirmed' else status end`;
      let lateNote = '';
      if (ord?.stock_released_at) {
        // Pagamento aprovado depois de o pedido ter expirado/sido cancelado: o stock já tinha sido devolvido.
        if (await reserveStockAgain(client, tx.order_id)) {
          orderStatusSql = `case when status in ('pending','cancelled') then 'confirmed' else status end`;
          lateNote = ' Chegou depois do prazo; o stock foi reservado outra vez.';
        } else {
          orderStatusSql = `case when status='cancelled' then 'pending' else status end`;
          lateNote = ' ATENÇÃO: chegou depois do prazo e já não há stock. Reembolse ou contacte o cliente.';
        }
      }
      await client.query(`update orders set payment_status='paid', paid_at=coalesce(paid_at,now()), status=${orderStatusSql} where id=$1`, [tx.order_id]);
      notification = {
        type: lateNote ? 'payment_late' : 'payment_succeeded',
        title: lateNote ? 'Pagamento recebido fora do prazo' : 'Pagamento confirmado',
        message: `A transação ${tx.provider_reference || transactionId} do pedido ${code} foi confirmada.${lateNote}`,
      };
    } else if (normalized === 'failed' || normalized === 'cancelled') {
      await client.query(`update orders set payment_status=$1, status=case when status='pending' then 'cancelled' else status end where id=$2`, [normalized, tx.order_id]);
      await releaseStockIfNeeded(client, tx.order_id);
      if (details.failureCode === 'timeout') {
        notification = { type: 'payment_expired', title: 'Pagamento expirado', message: `O cliente não confirmou o pagamento do pedido ${code} a tempo.` };
      } else if (details.failureCode === 'customer_cancelled') {
        notification = { type: 'payment_cancelled', title: 'Pagamento cancelado', message: `O cliente cancelou o pagamento do pedido ${code}.` };
      } else if (normalized === 'failed') {
        const why = details.failureMessage ? `: ${String(details.failureMessage).slice(0, 160)}` : '.';
        notification = { type: 'payment_failed', title: 'Pagamento recusado', message: `O pagamento do pedido ${code} foi recusado${why}` };
      } else {
        notification = { type: 'payment_cancelled', title: 'Pagamento cancelado', message: `O pagamento do pedido ${code} foi cancelado.` };
      }
    } else if (normalized === 'refunded') {
      await client.query(`update orders set payment_status='refunded' where id=$1`, [tx.order_id]);
      await releaseStockIfNeeded(client, tx.order_id);
      notification = { type: 'payment_refunded', title: 'Pagamento reembolsado', message: `O pagamento do pedido ${code} foi reembolsado.` };
    }
    if (notification) {
      await client.query(`insert into notifications (audience,type,title,message,order_id,transaction_id) values ('admin',$1,$2,$3,$4,$5)`, [notification.type, notification.title, notification.message, tx.order_id, transactionId]);
    }
    await client.query('COMMIT');
    return { ...tx, status: normalized };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally { client.release(); }
}

const expireTransaction = (transactionId) =>
  applyTransactionStatus(transactionId, 'cancelled', { failureCode: 'timeout', failureMessage: 'O cliente não confirmou o pagamento a tempo.' });

// Expira pagamentos pendentes fora de prazo (2 min no telemóvel, 1 h no cartão) e devolve o stock.
// Corre de 30 em 30 s (server.js) e também quando o cliente consulta o estado.
export async function sweepExpiredPayments() {
  const { rows } = await query(
    `select id from payment_transactions
     where status in ('pending','processing')
       and created_at < now() - (case when method='visa_card' then $1::int else $2::int end) * interval '1 second'
     order by id limit 50`,
    [CARD_TIMEOUT_SECONDS, MOBILE_TIMEOUT_SECONDS]
  );
  for (const r of rows) {
    try { await expireTransaction(r.id); } catch (e) { console.error('[pagamento] falha ao expirar', r.id, e.message); }
  }
  return rows.length;
}

async function initiatePayment({ orderId, code, amount, method, customer, payerPhone }) {
  const cfg = paymentConfig();
  const gatewayMethod = methodToGateway(method);
  const wallet = cfg.wallets[gatewayMethod];
  if (!wallet) throw new Error(`Carteira ZumboPay não configurada para ${method}.`);
  let providerResponse;
  if (gatewayMethod === 'mpesa' || gatewayMethod === 'emola') {
    providerResponse = await zumboRequest('/charges', {
      method: 'POST',
      idempotencyKey: code,
      body: {
        wallet_id: wallet,
        amount,
        // O número que vai pagar (pode ser diferente do telemóvel de contacto).
        msisdn: String(payerPhone || customer.phone).replace(/\D/g, ''),
        customer_name: customer.name,
        source_id: code,
      },
    });
  } else {
    providerResponse = await zumboRequest('/payments', {
      method: 'POST',
      idempotencyKey: code,
      body: {
        title: `Pedido ${code}`,
        amount,
        currency: 'MZN',
        channels: ['card'],
        wallet_id: wallet,
        description: `Pagamento do pedido ${code}`,
        max_uses: 1,
        expires_at: new Date(Date.now() + CARD_TIMEOUT_SECONDS * 1000).toISOString(),
      },
    });
  }
  const data = extractProviderData(providerResponse);
  const providerStatus = normalizeProviderStatus(data.status);
  const ref = data.reference || data.id || null;
  const checkoutUrl = data.checkout_url || data.checkoutUrl || null;
  if (gatewayMethod === 'card' && !checkoutUrl && providerStatus !== 'succeeded') {
    const err = new Error('O gateway não devolveu o link de pagamento (checkout_url) para o cartão.');
    err.providerResponse = providerResponse;
    throw err;
  }
  const tr = await query(
    `insert into payment_transactions (order_id,provider,method,amount_mzn,currency,status,provider_reference,checkout_url,raw_response,paid_at)
     values ($1,'zumbopay',$2,$3,'MZN',$4,$5,$6,$7::jsonb,$8)
     returning id`,
    [orderId, method, amount, providerStatus, ref, checkoutUrl, JSON.stringify(providerResponse), providerStatus === 'succeeded' ? new Date() : null]
  );
  if (providerStatus === 'succeeded') await applyTransactionStatus(tr.rows[0].id, 'succeeded', { providerReference: ref, rawResponse: providerResponse });
  else if (providerStatus === 'failed') await applyTransactionStatus(tr.rows[0].id, 'failed', { providerReference: ref, failureMessage: data.message, rawResponse: providerResponse });
  else await query(`update orders set payment_status='processing' where id=$1`, [orderId]);
  return { transactionId: tr.rows[0].id, status: providerStatus, providerReference: ref, checkoutUrl, timeoutSeconds: timeoutFor(method), secondsLeft: timeoutFor(method) };
}

// Estado atual do pagamento de um pedido (última transação), com os segundos que faltam.
async function paymentSnapshot(code) {
  const { rows } = await query(
    `select o.code,o.total_mzn,o.payment_method,o.payment_status,o.status,o.paid_at,
            t.id as tx_id, t.status as transaction_status, t.provider_reference, t.checkout_url, t.failure_code, t.failure_message, t.updated_at,
            greatest(0, ceil((case when t.method='visa_card' then $2::int else $3::int end) - extract(epoch from (now() - t.created_at))))::int as seconds_left
     from orders o
     left join lateral (select * from payment_transactions where order_id=o.id order by id desc limit 1) t on true
     where o.code=$1`,
    [code, CARD_TIMEOUT_SECONDS, MOBILE_TIMEOUT_SECONDS]
  );
  return rows[0] || null;
}

const isActive = (r) => Boolean(r.tx_id) && ['pending', 'processing'].includes(r.transaction_status);

function shapePayment(r) {
  const outcome = outcomeOf({ transactionStatus: r.transaction_status, paymentStatus: r.payment_status, failureCode: r.failure_code });
  const active = isActive(r) && outcome === 'pending';
  return {
    code: r.code,
    total: r.total_mzn,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    orderStatus: r.status,
    paidAt: r.paid_at,
    transactionStatus: r.transaction_status,
    outcome,
    reference: r.provider_reference,
    checkoutUrl: active ? r.checkout_url : null,
    failureCode: r.failure_code,
    failureMessage: r.failure_message,
    timeoutSeconds: timeoutFor(r.payment_method),
    secondsLeft: active ? r.seconds_left : 0,
    updatedAt: r.updated_at,
  };
}

router.get('/products', wrap(async (_req, res) => {
  const { rows } = await query(`select ${PRODUCT_SELECT} from products p where p.active order by p.id`);
  res.set('Cache-Control', 'public, max-age=30');
  res.json(rows.map(mapProduct));
}));

router.get('/products/:slug', wrap(async (req, res) => {
  const { rows } = await query(`select ${PRODUCT_SELECT} from products p where p.slug = $1 and p.active`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found', message: t(getLang(req), 'not_found') });
  res.json(mapProduct(rows[0]));
}));

router.post('/orders', wrap(async (req, res) => {
  const lang = getLang(req);
  const v = validate(orderSchema, req.body, lang);
  if (!v.ok) return validationError(res, lang, v.fields);
  const { customer, paymentMethod, items } = v.data;
  // M-Pesa/e-Mola: o número que vai pagar (validado por operadora). Cartão: não usa número.
  const payerPhone = isMobileMethod(paymentMethod) ? v.data.paymentPhone : null;
  if (!['mpesa','emola','visa_card'].includes(paymentMethod)) return validationError(res, lang, { paymentMethod: t(lang, 'invalid_payment') });

  const wanted = new Map();
  for (const it of items) {
    const key = `${it.productId}:${it.variantId ?? ''}`;
    const previous = wanted.get(key);
    wanted.set(key, { productId: it.productId, variantId: it.variantId ?? null, qty: (previous?.qty || 0) + it.qty });
  }
  const requested = [...wanted.values()];
  const ids = [...new Set(requested.map((it) => it.productId))];
  const client = await pool.connect();
  let order = null;
  let total = 0;
  try {
    await client.query('BEGIN');
    const productResult = await client.query(`select id as product_id, name_pt, name_en, price_mzn, stock as product_stock from products where id = any($1::int[]) and active for update`, [ids]);
    const variantResult = await client.query(`select id as variant_id, product_id, name_pt as variant_name_pt, name_en as variant_name_en, color as variant_color, stock as variant_stock from product_variants where product_id = any($1::int[]) and active for update`, [ids]);
    const byProduct = new Map();
    for (const row of productResult.rows) byProduct.set(row.product_id, { product: row, variants: new Map() });
    for (const row of variantResult.rows) byProduct.get(row.product_id)?.variants.set(row.variant_id, row);
    if (byProduct.size !== ids.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'product_not_found', message: t(lang, 'product_not_found') }); }
    for (const it of requested) {
      const entry = byProduct.get(it.productId);
      const hasVariants = entry.variants.size > 0;
      const variant = it.variantId ? entry.variants.get(it.variantId) : null;
      if (hasVariants && !variant) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'validation', message: t(lang, 'invalid'), fields: { items: t(lang, 'variant_required') } }); }
      if (!hasVariants && it.variantId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'validation', message: t(lang, 'invalid'), fields: { items: t(lang, 'invalid') } }); }
      const stock = variant ? variant.variant_stock : entry.product.product_stock;
      if (stock < it.qty) { await client.query('ROLLBACK'); const name = lang === 'en' ? (variant?.variant_name_en || entry.product.name_en) : (variant?.variant_name_pt || entry.product.name_pt); return res.status(409).json({ error: 'out_of_stock', message: t(lang, 'out_of_stock', { name }) }); }
      total += entry.product.price_mzn * it.qty;
    }
    for (let attempt = 0; attempt < 3 && !order; attempt++) {
      await client.query('SAVEPOINT new_order');
      try {
        const r = await client.query(`insert into orders (code,customer_name,phone,city,address,notes,payment_method,total_mzn,lang,payment_status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') returning id,code`, [newCode(), customer.name, customer.phone, customer.city, customer.address, customer.notes, paymentMethod, total, lang]);
        order = r.rows[0];
      } catch (e) {
        if (e.code === '23505') { await client.query('ROLLBACK TO SAVEPOINT new_order'); continue; }
        throw e;
      }
    }
    if (!order) throw new Error('não foi possível gerar o código do pedido');
    for (const it of requested) {
      const entry = byProduct.get(it.productId);
      const variant = it.variantId ? entry.variants.get(it.variantId) : null;
      await client.query('insert into order_items (order_id,product_id,qty,unit_price_mzn,variant_id) values ($1,$2,$3,$4,$5)', [order.id, it.productId, it.qty, entry.product.price_mzn, it.variantId]);
      if (variant) await client.query('update product_variants set stock=stock-$1 where id=$2', [it.qty, variant.variant_id]);
      await client.query('update products set stock=stock-$1 where id=$2', [it.qty, it.productId]);
    }
    await client.query(`insert into notifications (audience,type,title,message,order_id) values ('admin','order_created','Novo pedido', $1, $2)`, [`Novo pedido ${order.code} aguardando pagamento${payerPhone ? ` (${paymentMethod === 'mpesa' ? 'M-Pesa' : 'e-Mola'} ${payerPhone})` : ' (cartão)'}.`, order.id]);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally { client.release(); }

  try {
    const payment = await initiatePayment({ orderId: order.id, code: order.code, amount: total, method: paymentMethod, customer, payerPhone });
    res.status(201).json({ code: order.code, orderId: order.id, total, paymentMethod, payerPhone, payment });
  } catch (err) {
    console.error('[pagamento] falha ao iniciar', JSON.stringify({ order: order.code, method: paymentMethod, httpStatus: err.status || null, providerCode: err.providerCode || null, message: err.message, providerResponse: err.providerResponse || null }));
    const reason = String(err.message || 'erro desconhecido').slice(0, 200);
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await client2.query(`update orders set payment_status='failed', status='cancelled' where id=$1`, [order.id]);
      await releaseStockIfNeeded(client2, order.id);
      await client2.query(`insert into notifications (audience,type,title,message,order_id) values ('admin','payment_failed','Falha ao iniciar pagamento',$1,$2)`, [`Não foi possível iniciar o pagamento do pedido ${order.code}. Motivo: ${reason}`, order.id]);
      await client2.query('COMMIT');
    } catch { try { await client2.query('ROLLBACK'); } catch {} }
    finally { client2.release(); }
    return res.status(502).json({ error: 'payment_gateway', message: t(lang, 'payment_start_failed'), orderCode: order.code });
  }
}));

router.get('/orders/:code/payment', wrap(async (req, res) => {
  const lang = getLang(req);
  let r = await paymentSnapshot(req.params.code);
  if (!r) return res.status(404).json({ error: 'not_found', message: t(lang, 'not_found') });
  // Passou o prazo (2 min no telemóvel) sem confirmação: expira já, sem esperar pela varredura.
  if (isActive(r) && r.seconds_left <= 0) {
    await expireTransaction(r.tx_id);
    r = await paymentSnapshot(req.params.code);
  }
  res.set('Cache-Control', 'no-store');
  res.json(shapePayment(r));
}));

// O cliente desiste enquanto espera pela aprovação no telemóvel.
router.post('/orders/:code/payment/cancel', wrap(async (req, res) => {
  const lang = getLang(req);
  let r = await paymentSnapshot(req.params.code);
  if (!r) return res.status(404).json({ error: 'not_found', message: t(lang, 'not_found') });
  if (isActive(r)) {
    await applyTransactionStatus(r.tx_id, 'cancelled', { failureCode: 'customer_cancelled', failureMessage: 'O cliente cancelou o pagamento.' });
    r = await paymentSnapshot(req.params.code);
  }
  res.set('Cache-Control', 'no-store');
  res.json(shapePayment(r));
}));

// Fatura / comprovativo em PDF. Só existe para pedidos pagos. Quem tem o código do pedido consegue descarregá-la.
function shopInfo() {
  const rate = Number(cleanEnv(process.env.INVOICE_VAT_RATE));
  return {
    name: cleanEnv(process.env.SHOP_NAME) || 'Dumba',
    nuit: cleanEnv(process.env.SHOP_NUIT),
    address: cleanEnv(process.env.SHOP_ADDRESS),
    phone: cleanEnv(process.env.SHOP_PHONE),
    email: cleanEnv(process.env.SHOP_EMAIL),
    vatRate: Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : 0,
  };
}

router.get('/orders/:code/invoice', wrap(async (req, res) => {
  const lang = getLang(req);
  const { rows } = await query(
    `select o.id,o.code,o.customer_name,o.phone,o.city,o.address,o.payment_method,o.total_mzn,o.lang,o.payment_status,o.paid_at,o.created_at,
            (select provider_reference from payment_transactions t where t.order_id=o.id and t.status='succeeded' order by t.id desc limit 1) as reference
     from orders o where o.code=$1`, [req.params.code]);
  const order = rows[0];
  if (!order) return res.status(404).json({ error: 'not_found', message: t(lang, 'not_found') });
  if (order.payment_status !== 'paid') return res.status(409).json({ error: 'not_paid', message: t(lang, 'invoice_not_paid') });
  const itemRows = (await query(
    `select oi.qty, oi.unit_price_mzn, p.name_pt, p.name_en, v.name_pt as variant_pt, v.name_en as variant_en
     from order_items oi join products p on p.id=oi.product_id left join product_variants v on v.id=oi.variant_id
     where oi.order_id=$1 order by oi.id`, [order.id])).rows;
  const docLang = req.query.lang ? lang : (order.lang === 'en' ? 'en' : 'pt');
  const items = itemRows.map((r) => ({
    qty: r.qty, unit_price_mzn: r.unit_price_mzn,
    name: docLang === 'en' ? r.name_en : r.name_pt,
    variant: docLang === 'en' ? r.variant_en : r.variant_pt,
  }));
  const pdf = await buildInvoicePdf({ order, items, shop: shopInfo(), lang: docLang });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Fatura-${order.code}.pdf"`, 'Cache-Control': 'no-store' });
  res.send(Buffer.from(pdf));
}));

router.post('/webhooks/zumbopay', wrap(async (req, res) => {
  const secret = process.env.ZUMBOPAY_WEBHOOK_SECRET;
  const signature = String(req.headers['x-zumbopay-signature'] || '');
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  if (!secret || !signature) return res.status(401).json({ error: 'invalid_signature' });
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ error: 'invalid_signature' });
  const payload = req.body || {};
  const eventType = payload.event || payload.type || payload.event_type || 'payment.updated';
  const data = extractProviderData(payload);
  const reference = data.reference || data.provider_reference || data.id || payload.reference || null;
  const eventId = payload.id || payload.event_id || `${eventType}:${reference}:${payload.created_at || ''}`;
  const inserted = await query(`insert into payment_webhook_events (event_id,event_type,provider_ref,signature,payload) values ($1,$2,$3,$4,$5::jsonb) on conflict (provider,event_id) do nothing returning id`, [String(eventId), eventType, reference, signature, JSON.stringify(payload)]);
  if (!inserted.rows[0]) return res.json({ ok: true, duplicate: true });
  const tx = await query(`select id from payment_transactions where provider='zumbopay' and provider_reference=$1 order by id desc limit 1`, [reference]);
  if (!tx.rows[0]) {
    await query(`update payment_webhook_events set processing_error='transaction_not_found',processed_at=now() where id=$1`, [inserted.rows[0].id]);
    return res.json({ ok: true, ignored: true });
  }
  try {
    const status = eventType === 'payment.succeeded' ? 'succeeded' : eventType === 'payment.failed' ? 'failed' : eventType === 'payment.refunded' ? 'refunded' : normalizeProviderStatus(data.status);
    await applyTransactionStatus(tx.rows[0].id, status, { providerReference: reference, failureCode: data.error_code || data.code, failureMessage: data.message || data.error?.message, rawResponse: payload, force: eventType === 'payment.refunded' });
    await query(`update payment_webhook_events set processed_at=now() where id=$1`, [inserted.rows[0].id]);
    return res.json({ ok: true });
  } catch (e) {
    await query(`update payment_webhook_events set processing_error=$1 where id=$2`, [e.message, inserted.rows[0].id]);
    throw e;
  }
}));

// Admin
router.post('/admin/login', wrap(async (req, res) => {
  const cfg = adminPayload();
  if (!cfg.username || !cfg.password || !cfg.secret) {
    console.warn('[admin] login impossível: faltam ADMIN_USERNAME, ADMIN_PASSWORD ou ADMIN_SESSION_SECRET no ambiente.');
    return res.status(503).json({ error: 'admin_not_configured', message: 'Administração não configurada no servidor.' });
  }
  const check = checkAdminCredentials(req.body, process.env);
  if (!check.ok) {
    // Só o nome do campo vai para o log (nunca os valores), para saber o que corrigir.
    console.warn(`[admin] login recusado: ${!check.userOk ? 'utilizador incorreto' : 'palavra-passe incorreta'}`);
    return res.status(401).json({ error: 'invalid_credentials', message: 'Credenciais inválidas.' });
  }
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const token = signAdminSession({ role: 'admin', username: cfg.username, exp: expiresAt });
  res.json({ ok: true, username: cfg.username, token, expiresAt });
}));
router.post('/admin/logout', (_req, res) => res.json({ ok: true }));
router.get('/admin/me', (req, res) => res.json({ authenticated: verifyAdminSession(adminTokenFrom(req)) }));
router.get('/admin/summary', requireAdmin, wrap(async (_req, res) => {
  const [a,b,c,d] = await Promise.all([
    query(`select count(*)::int as n from payment_transactions`),
    query(`select count(*)::int as n from payment_transactions where status='succeeded'`),
    query(`select coalesce(sum(amount_mzn),0)::int as n from payment_transactions where status='succeeded'`),
    query(`select count(*)::int as n from payment_transactions where status in ('pending','processing')`),
  ]);
  res.json({ totalTransactions: a.rows[0].n, successfulTransactions: b.rows[0].n, revenueMzn: c.rows[0].n, pendingTransactions: d.rows[0].n });
}));
router.get('/admin/transactions', requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = req.query.status && ['pending','processing','succeeded','failed','refunded','cancelled'].includes(req.query.status) ? req.query.status : null;
  const method = req.query.method && ['mpesa','emola','visa_card'].includes(req.query.method) ? req.query.method : null;
  const { rows } = await query(`
    select t.id,t.order_id,o.code,o.customer_name,o.phone,t.method,t.amount_mzn,t.currency,t.status,t.provider_reference,t.checkout_url,t.failure_code,t.failure_message,t.created_at,t.updated_at,t.paid_at
    from payment_transactions t join orders o on o.id=t.order_id
    where ($1::text is null or t.status=$1) and ($2::text is null or t.method=$2)
    order by t.created_at desc limit $3 offset $4`, [status, method, limit, offset]);
  res.json(rows);
}));
router.get('/admin/transactions/:id', requireAdmin, wrap(async (req, res) => {
  const { rows } = await query(`select t.*,o.code,o.customer_name,o.phone,o.city,o.address,o.total_mzn,o.payment_status,o.status as order_status,o.created_at as order_created_at from payment_transactions t join orders o on o.id=t.order_id where t.id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found', message: 'Transação não encontrada.' });
  res.json(rows[0]);
}));
router.get('/admin/notifications', requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const { rows } = await query(`select id,type,title,message,order_id,transaction_id,read_at,created_at from notifications where audience='admin' order by created_at desc limit $1`, [limit]);
  const unread = await query(`select count(*)::int as n from notifications where audience='admin' and read_at is null`);
  res.json({ items: rows, unread: unread.rows[0].n });
}));
router.post('/admin/notifications/read', requireAdmin, wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length) await query(`update notifications set read_at=coalesce(read_at,now()) where audience='admin' and id=any($1::bigint[])`, [ids]);
  else await query(`update notifications set read_at=coalesce(read_at,now()) where audience='admin'`);
  res.json({ ok: true });
}));
router.get('/admin/integration', requireAdmin, wrap(async (_req, res) => {
  const cfg = paymentConfig();
  const configured = Boolean(cfg.apiKey && cfg.merchantId && cfg.webhookSecret && cfg.wallets.mpesa && cfg.wallets.emola && cfg.wallets.card);
  let remote = null;
  if (cfg.apiKey && cfg.merchantId) {
    try { remote = extractProviderData(await zumboRequest('/merchant/validate')); } catch (e) { remote = { error: e.message }; }
  }
  res.json({ configured, apiUrl: cfg.baseUrl, merchantId: cfg.merchantId || null, wallets: { mpesa: Boolean(cfg.wallets.mpesa), emola: Boolean(cfg.wallets.emola), card: Boolean(cfg.wallets.card) }, remote });
}));

router.post('/contact', wrap(async (req, res) => {
  const lang = getLang(req); const v = validate(contactSchema, req.body, lang);
  if (!v.ok) return validationError(res, lang, v.fields);
  const { name, email, message } = v.data;
  await query('insert into contact_messages (name,email,message,lang) values ($1,$2,$3,$4)', [name,email,message,lang]);
  res.status(201).json({ ok: true });
}));
router.post('/newsletter', wrap(async (req, res) => {
  const lang = getLang(req); const v = validate(newsletterSchema, req.body, lang);
  if (!v.ok) return validationError(res, lang, v.fields);
  await query('insert into subscribers (email,lang) values ($1,$2) on conflict (email) do nothing', [v.data.email.toLowerCase(),lang]);
  res.status(201).json({ ok: true });
}));

export default router;
