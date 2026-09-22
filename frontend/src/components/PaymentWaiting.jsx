import { useCallback, useEffect, useRef, useState } from 'react';
import { money, useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { api } from '../api.js';
import { formatPhone } from '../validate.js';

const R = 54;
const CIRC = 2 * Math.PI * R;
const POLL_MS = 3000;
const HINT_AFTER_S = 30;

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Espera pela aprovação no telemóvel (M-Pesa / e-Mola).
// O tempo restante vem do servidor (que é quem decide quando expira) e é só mostrado aqui.
export default function PaymentWaiting({ order, payPhone, onOutcome }) {
  const { t, lang } = useLang();
  const alert = useAlert();
  const total = order.payment?.timeoutSeconds || 120;
  const [deadline, setDeadline] = useState(() => Date.now() + (order.payment?.secondsLeft ?? total) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const finished = useRef(false);
  const inFlight = useRef(false);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const finish = useCallback((p) => {
    if (finished.current) return;
    finished.current = true;
    onOutcomeRef.current(p);
  }, []);

  const poll = useCallback(async () => {
    if (finished.current || inFlight.current) return;
    inFlight.current = true;
    try {
      const p = await api(`/orders/${encodeURIComponent(order.code)}/payment`, { lang });
      setOffline(false);
      if (p.outcome && p.outcome !== 'pending') finish(p);
      else if (typeof p.secondsLeft === 'number') setDeadline(Date.now() + p.secondsLeft * 1000);
    } catch {
      setOffline(true);
    } finally {
      inFlight.current = false;
    }
  }, [order.code, lang, finish]);

  // Consulta o servidor de 3 em 3 s (e logo ao abrir).
  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Relógio local; usa a hora real (não conta ticks) para não atrasar quando o separador está em segundo plano.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Ao voltar ao separador, atualiza logo.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [poll]);

  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const timeUp = left === 0;

  // O relógio chegou a zero: pergunta ao servidor até ele confirmar o fim (expirou ou foi pago).
  useEffect(() => {
    if (!timeUp) return undefined;
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [timeUp, poll]);

  async function cancel() {
    const yes = await alert.confirm({
      title: t('co.wait.cancel.title'),
      message: t('co.wait.cancel.text', { code: order.code }),
      confirmText: t('co.wait.cancel.yes'),
      cancelText: t('co.wait.cancel.keep'),
      danger: true,
    });
    if (!yes || finished.current) return;
    setCancelling(true);
    try {
      const p = await api(`/orders/${encodeURIComponent(order.code)}/payment/cancel`, { method: 'POST', lang });
      if (p.outcome && p.outcome !== 'pending') finish(p);
      else { alert.error(t('err.server')); setCancelling(false); }
    } catch (e) {
      alert.error(e.code === 'network' ? t('err.network') : t('err.server'));
      setCancelling(false);
    }
  }

  const method = t(`f.pay.${order.paymentMethod}`);
  const amount = money(order.total, lang);
  const phone = formatPhone(payPhone);
  const dash = CIRC * (1 - Math.min(1, left / total));
  const elapsed = total - left;

  return (
    <div className="co-wait">
      <div className={`co-timer${left <= 30 ? ' low' : ''}`} role="timer" aria-label={`${mmss(left)} ${t('co.wait.left')}`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="bg" cx="60" cy="60" r={R} />
          <circle className="fg" cx="60" cy="60" r={R} strokeDasharray={CIRC} strokeDashoffset={dash} />
        </svg>
        <div className="t"><strong>{mmss(left)}</strong><small>{t('co.wait.left')}</small></div>
      </div>

      <h2 id="co-title">{t('co.wait.title')}</h2>
      <p className="co-sub">{t('co.wait.sub', { method, amount, phone })}</p>

      <ol className="co-how">
        <li>{t('co.wait.s1', { method })}</li>
        <li>{t('co.wait.s2', { amount })}</li>
        <li>{t('co.wait.s3')}</li>
      </ol>

      <div className={`co-status${offline ? ' off' : ''}`} role="status">
        <span className="spinner" /> {offline ? t('co.wait.offline') : t('co.wait.status')}
      </div>
      {elapsed >= HINT_AFTER_S && !timeUp && <p className="co-hint">{t('co.wait.hint', { phone })}</p>}

      <button type="button" className="btn ghost block" onClick={cancel} disabled={cancelling}>{t('co.wait.cancel')}</button>
    </div>
  );
}
