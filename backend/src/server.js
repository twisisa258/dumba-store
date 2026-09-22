import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes, { sweepExpiredPayments } from './routes.js';
import { seoRouter } from './seo.js';
import { getLang, t } from './messages.js';

const app = express();
const missingEnv = (names) => names.filter((n) => !process.env[n]);
const noAdmin = missingEnv(['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET']);
if (noAdmin.length) console.warn(`[config] administração indisponível, faltam: ${noAdmin.join(', ')}`);
const noPay = missingEnv(['ZUMBOPAY_API_KEY', 'ZUMBOPAY_MERCHANT_ID', 'ZUMBOPAY_WEBHOOK_SECRET', 'ZUMBOPAY_WALLET_MPESA', 'ZUMBOPAY_WALLET_EMOLA', 'ZUMBOPAY_WALLET_CARD']);
if (noPay.length) console.warn(`[config] pagamentos incompletos, faltam: ${noPay.join(', ')}`);
if (!process.env.CORS_ORIGINS) console.warn('[config] CORS_ORIGINS não definido: só http://localhost:5173 é aceite.');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    const ok = !origin || allowed.includes(origin);
    if (!ok) console.warn(`[cors] origem bloqueada: ${origin} (permitidas: ${allowed.join(', ')}). Ajuste CORS_ORIGINS.`);
    cb(null, ok);
  },
}));
app.use(express.json({ limit: '50kb', verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use((req, _res, next) => {
  const header = req.headers.cookie || '';
  req.cookies = Object.fromEntries(header.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return [i >= 0 ? x.slice(0,i) : x, i >= 0 ? decodeURIComponent(x.slice(i+1)) : '']; }));
  next();
});

const tooMany = (req, res) =>
  res.status(429).json({ error: 'too_many_requests', message: t(getLang(req), 'too_many_requests') });

const general = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, handler: tooMany });
const strict = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: tooMany });
// Login do admin: só as tentativas falhadas contam (20 em 15 min por IP), para não bloquear quem acerta.
const adminLogin = rateLimit({ windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, handler: tooMany });

app.get('/health', (_req, res) => res.json({ ok: true }));
// Fora do /api e sem limite de pedidos: é lido pelos motores de busca, não por pessoas.
app.use(seoRouter);
app.use('/api', general);
app.use('/api/admin/login', adminLogin);
app.use('/api', (req, res, next) => (req.method === 'POST' && req.path !== '/webhooks/zumbopay' && req.path !== '/admin/login' ? strict(req, res, next) : next()));
app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'not_found', message: t(getLang(req), 'not_found') }));
app.use((err, req, res, _next) => {
  console.error('[erro]', err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'validation', message: t(getLang(req), 'invalid') });
  }
  res.status(500).json({ error: 'server_error', message: t(getLang(req), 'server_error') });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Dumba API a correr na porta ${port}`);
  // Pagamentos pendentes fora de prazo (2 min no telemóvel) são cancelados e o stock volta à loja.
  const sweep = () => sweepExpiredPayments().catch((e) => console.error('[pagamento] varredura falhou:', e.message));
  setTimeout(sweep, 5_000);
  setInterval(sweep, 30_000);
});
