import { useEffect, useRef } from 'react';
import { money, useLang } from '../i18n.jsx';
import { API_URL } from '../config.js';

const ICONS = {
  ok: <path className="draw" d="M6 12.5l4 4 8-9" />,
  bad: <path className="draw" d="M7 7l10 10M17 7L7 17" />,
  warn: <><circle cx="12" cy="12" r="8" /><path className="draw" d="M12 7.5V12l3 2" /></>,
  muted: <path className="draw" d="M7 12h10" />,
};

const TONE = { paid: 'ok', declined: 'bad', error: 'bad', expired: 'warn', cancelled: 'muted' };

// Pop-up com o resultado do pagamento. `result`:
// { outcome: paid|declined|expired|cancelled|error, code, total, method, reference, reason, message, timeoutSeconds }
export default function PaymentResult({ result, onRetry, onClose }) {
  const { t, lang } = useLang();
  const primary = useRef(null);
  const { outcome } = result;
  const tone = TONE[outcome] || 'muted';
  const paid = outcome === 'paid';

  useEffect(() => {
    primary.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const minutes = Math.max(1, Math.round((result.timeoutSeconds || 120) / 60));
  const text = outcome === 'error'
    ? result.message
    : t(`co.res.${outcome}.text`, { code: String(result.code || '').replace(/-/g, '\u2011'), minutes }); // hífen sem quebra de linha
  const rows = outcome === 'error' ? [] : [
    [t('co.res.order'), result.code],
    [t('co.res.amount'), money(result.total, lang)],
    [t('co.res.method'), t(`f.pay.${result.method}`)],
    result.reference && paid ? [t('co.res.ref'), result.reference] : null,
  ].filter(Boolean);

  return (
    <div className="overlay center">
      <div className={`dialog result result-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="res-title" aria-describedby="res-text">
        <div className="res-ico"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[tone]}</svg></div>
        <h2 id="res-title">{t(`co.res.${outcome}.title`)}</h2>
        <p id="res-text">{text}</p>
        {result.reason && outcome === 'declined' && <p className="res-reason">{t('co.res.reason', { reason: result.reason })}</p>}
        {rows.length > 0 && (
          <dl className="res-rows">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        <div className="dialog-actions">
          {paid ? (
            <>
              {result.code && <a className="btn ghost" href={`${API_URL}/api/orders/${encodeURIComponent(result.code)}/invoice?lang=${lang}`} target="_blank" rel="noopener noreferrer">{t('co.res.invoice')}</a>}
              <button ref={primary} type="button" className="btn" onClick={onClose}>{t('co.res.continue')}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={onClose}>{t('co.res.close')}</button>
              <button ref={primary} type="button" className="btn" onClick={onRetry}>{t('co.res.retry')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
