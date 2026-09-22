import { useEffect, useState } from 'react';
import { money, useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { useCart } from '../cart.jsx';
import { api } from '../api.js';
import { CITIES } from '../config.js';
import { digitsOnly, formatPhone, isMobileMethod, phoneFitsMethod, validateCheckout, validatePayment } from '../validate.js';
import { useScrollLock } from '../useScrollLock.js';
import Field from './Field.jsx';
import PaymentWaiting from './PaymentWaiting.jsx';
import PaymentResult from './PaymentResult.jsx';

const DETAIL_FIELDS = ['name', 'phone', 'city', 'address'];
const PAYMENTS = ['mpesa', 'emola', 'visa_card'];
const STEP_NUMBER = { details: 1, payment: 2, waiting: 3, card: 3 };

// Número sugerido para pagar: o atual, se servir ao método; senão o de contacto, se servir; senão vazio.
function suggestPayPhone(method, current, contact) {
  if (!isMobileMethod(method)) return current;
  if (current && phoneFitsMethod(method, current)) return current;
  return contact && phoneFitsMethod(method, contact) ? contact : '';
}

function errorText(err, t) {
  if (err.code === 'network') return t('err.network');
  if (!err.message || ['server', 'config', 'bad_response'].includes(err.message)) return t('err.server');
  return err.message;
}

function Stepper({ step }) {
  const { t } = useLang();
  const current = STEP_NUMBER[step];
  const items = [['details', t('co.step.details')], ['payment', t('co.step.payment')], ['confirm', t('co.step.confirm')]];
  return (
    <ol className="co-steps" aria-label={t('checkout.title')}>
      {items.map(([key, label], i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'on' : '';
        return (
          <li key={key} className={state} aria-current={n === current ? 'step' : undefined}>
            <span className="n">{n < current ? '✓' : n}</span><span className="l">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function CheckoutModal({ onClose }) {
  const { t, lang } = useLang();
  const alert = useAlert();
  const { items, total, clear } = useCart();
  const [vals, setVals] = useState({ name: '', phone: '', city: '', address: '', notes: '', paymentMethod: 'mpesa', payPhone: '' });
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState('details'); // details | payment | waiting | card
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const [result, setResult] = useState(null);
  useScrollLock(true);

  const locked = busy || step === 'waiting' || Boolean(result);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !locked) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  // Ao chegar à etapa de pagamento, leva o cursor ao número (se for M-Pesa/e-Mola e ainda estiver vazio).
  useEffect(() => {
    if (step === 'payment' && isMobileMethod(vals.paymentMethod) && !vals.payPhone) document.getElementById('co-payPhone')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const set = (k, v) => {
    setVals((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };
  const ctl = (k) => ({ id: `co-${k}`, name: k, value: vals[k], onChange: (e) => set(k, e.target.value), 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `co-${k}-err` : undefined });
  const focusFirst = (errs, keys) => { const first = keys.find((k) => errs[k]); if (first) document.getElementById(`co-${first}`)?.focus(); };

  function chooseMethod(method) {
    setVals((s) => ({ ...s, paymentMethod: method, payPhone: suggestPayPhone(method, s.payPhone, s.phone) }));
    setErrors((e) => { const n = { ...e }; delete n.payPhone; return n; });
  }

  function goPayment(e) {
    e.preventDefault();
    const errs = validateCheckout(vals, t);
    setErrors(errs);
    if (Object.keys(errs).length) { alert.error(t('checkout.fixErrors')); focusFirst(errs, DETAIL_FIELDS); return; }
    setVals((s) => ({ ...s, payPhone: suggestPayPhone(s.paymentMethod, s.payPhone, s.phone) }));
    setStep('payment');
  }

  function showResult(outcome, data = {}) {
    setResult({ outcome: outcome === 'refunded' ? 'cancelled' : outcome, timeoutSeconds: order?.payment?.timeoutSeconds, ...data });
  }

  // Resultado vindo do servidor (aprovado, recusado, expirou ou cancelado).
  function onOutcome(p) {
    if (p.outcome === 'paid') clear();
    showResult(p.outcome, {
      code: p.code, total: p.total, method: p.paymentMethod, reference: p.reference,
      reason: p.outcome === 'declined' ? p.failureMessage : null, timeoutSeconds: p.timeoutSeconds,
    });
  }

  async function pay(e) {
    e.preventDefault();
    if (busy) return;
    const mobile = isMobileMethod(vals.paymentMethod);
    const errs = { ...validateCheckout(vals, t), ...validatePayment(vals, t) };
    setErrors(errs);
    if (Object.keys(errs).length) {
      if (DETAIL_FIELDS.some((k) => errs[k])) { setStep('details'); alert.error(t('checkout.fixErrors')); }
      else focusFirst(errs, ['payPhone']);
      return;
    }
    setBusy(true);
    try {
      const res = await api('/orders', {
        method: 'POST', lang,
        body: {
          lang,
          paymentMethod: vals.paymentMethod,
          paymentPhone: mobile ? `+258${vals.payPhone}` : undefined,
          customer: { name: vals.name.trim(), phone: `+258${vals.phone}`, city: vals.city, address: vals.address.trim(), notes: vals.notes.trim() },
          items: items.map((i) => ({ productId: i.id, variantId: i.variantId ?? null, qty: i.qty })),
        },
      });
      setOrder(res);
      const status = res.payment?.status;
      const base = { code: res.code, total: res.total, method: res.paymentMethod, timeoutSeconds: res.payment?.timeoutSeconds };
      if (status === 'succeeded') { clear(); setResult({ outcome: 'paid', reference: res.payment?.providerReference, ...base }); return; }
      if (status === 'failed') { setResult({ outcome: 'declined', ...base }); return; }
      if (mobile) { setStep('waiting'); return; }
      // Cartão: o pagamento acontece na página segura do gateway.
      clear();
      setStep('card');
      if (res.payment?.checkoutUrl) window.location.href = res.payment.checkoutUrl;
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) {
        const errs2 = { ...err.fields };
        if (errs2.paymentPhone) { errs2.payPhone = errs2.paymentPhone; delete errs2.paymentPhone; }
        setErrors(errs2);
        if (DETAIL_FIELDS.some((k) => errs2[k])) { setStep('details'); focusFirst(errs2, DETAIL_FIELDS); }
        else focusFirst(errs2, ['payPhone']);
        alert.error(errs2.items || t('checkout.fixErrors'));
      } else if (err.code === 'payment_gateway') {
        // O pedido não chegou a ser cobrado (o servidor cancelou-o e devolveu o stock).
        setResult({ outcome: 'error', message: err.message && err.message !== 'server' ? err.message : t('err.server') });
      } else {
        alert.error(errorText(err, t));
      }
    } finally { setBusy(false); }
  }

  function retry() {
    setResult(null);
    setOrder(null);
    setStep('payment');
  }

  const mobile = isMobileMethod(vals.paymentMethod);
  const methodName = t(`f.pay.${vals.paymentMethod}`);
  const canUseContact = mobile && vals.phone && vals.phone !== vals.payPhone && phoneFitsMethod(vals.paymentMethod, vals.phone);

  return (
    <>
      <div className="overlay center" onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
        <div className="modal co" role="dialog" aria-modal="true" aria-labelledby="co-title">
          {step !== 'waiting' && step !== 'card' && (
            <div className="modal-head">
              <h2 id="co-title">{t('checkout.title')}</h2>
              <button className="icon-btn" onClick={onClose} disabled={locked} aria-label={t('alert.close')}>×</button>
            </div>
          )}
          <Stepper step={step} />

          {step === 'details' && (
            <>
              <div className="summary">
                <h3>{t('checkout.summary')}</h3>
                <ul>{items.map((i) => <li key={`${i.id}:${i.variantId ?? ''}`}><span>{i.qty} × {i.name[lang]}{(i.variantName || i.variantColor) ? ` · ${i.variantName?.[lang] || i.variantName?.pt || i.variantColor}` : ''}</span><span>{money(i.qty * i.price, lang)}</span></li>)}</ul>
                <div className="total"><span>{t('cart.total')}</span><strong>{money(total, lang)}</strong></div>
              </div>
              <form onSubmit={goPayment} noValidate>
                <h3 className="co-h">{t('co.details.title')}</h3>
                <Field id="co-name" label={t('f.name')} error={errors.name}><input {...ctl('name')} autoComplete="name" placeholder={t('f.name.ph')} /></Field>
                <Field id="co-phone" label={t('f.phone')} error={errors.phone}><div className="prefix"><span>+258</span><input {...ctl('phone')} value={formatPhone(vals.phone)} onChange={(e) => set('phone', digitsOnly(e.target.value))} inputMode="tel" autoComplete="tel-national" placeholder={t('f.phone.ph')} /></div></Field>
                <Field id="co-city" label={t('f.city')} error={errors.city}><select {...ctl('city')} autoComplete="address-level2"><option value="">{t('f.city.ph')}</option>{CITIES.map((c) => <option key={c} value={c}>{t(`city.${c}`)}</option>)}</select></Field>
                <Field id="co-address" label={t('f.address')} error={errors.address}><textarea {...ctl('address')} rows={2} autoComplete="street-address" placeholder={t('f.address.ph')} /></Field>
                <Field id="co-notes" label={t('f.notes')} optional error={errors.notes}><input {...ctl('notes')} placeholder={t('f.notes.ph')} /></Field>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={onClose}>{t('checkout.cancel')}</button>
                  <button type="submit" className="btn">{t('co.continue')}</button>
                </div>
              </form>
            </>
          )}

          {step === 'payment' && (
            <form onSubmit={pay} noValidate>
              <fieldset className="pays">
                <legend>{t('co.pay.title')}</legend>
                {PAYMENTS.map((p) => (
                  <label key={p} className={`pay${vals.paymentMethod === p ? ' on' : ''}`}>
                    <input type="radio" name="paymentMethod" value={p} checked={vals.paymentMethod === p} onChange={() => chooseMethod(p)} />
                    <span><b>{t(`f.pay.${p}`)}</b><small>{t(`f.pay.${p}.d`)}</small></span>
                  </label>
                ))}
              </fieldset>

              {mobile ? (
                <Field id="co-payPhone" label={t('co.pay.number', { method: methodName })} error={errors.payPhone} hint={t('co.pay.number.hint', { method: methodName })}>
                  <div className="prefix">
                    <span>+258</span>
                    <input {...ctl('payPhone')} value={formatPhone(vals.payPhone)} onChange={(e) => set('payPhone', digitsOnly(e.target.value))} inputMode="tel" autoComplete="off" placeholder={t('f.phone.ph')} />
                  </div>
                  {canUseContact && <button type="button" className="link-btn" onClick={() => set('payPhone', vals.phone)}>{t('co.pay.use', { phone: formatPhone(vals.phone) })}</button>}
                </Field>
              ) : (
                <p className="co-note">{t('co.pay.card.info')}</p>
              )}

              <div className="co-total"><span>{t('co.pay.total')}</span><strong>{money(total, lang)}</strong></div>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={() => setStep('details')} disabled={busy}>{t('co.back')}</button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? t('co.pay.starting') : t(mobile ? 'co.pay.btn' : 'co.pay.btn.card', { amount: money(total, lang) })}
                </button>
              </div>
            </form>
          )}

          {step === 'waiting' && order && (
            <PaymentWaiting order={order} payPhone={vals.payPhone} onOutcome={onOutcome} />
          )}

          {step === 'card' && order && (
            <div className="co-card">
              <div className="payment-state-icon wait">…</div>
              <h2 id="co-title">{t('checkout.cardTitle')}</h2>
              <p>{t('checkout.cardText', { code: order.code })}</p>
              {order.payment?.checkoutUrl && <a className="btn block" href={order.payment.checkoutUrl}>{t('checkout.openPayment')}</a>}
              <button className="btn ghost block" onClick={onClose}>{t('checkout.done')}</button>
            </div>
          )}
        </div>
      </div>
      {result && <PaymentResult result={result} onRetry={retry} onClose={onClose} />}
    </>
  );
}
