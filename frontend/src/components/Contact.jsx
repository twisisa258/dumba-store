import { useState } from 'react';
import { useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { api } from '../api.js';
import { WHATSAPP } from '../config.js';
import { validateContact } from '../validate.js';
import Field from './Field.jsx';

const EMPTY = { name: '', email: '', message: '' };

export default function Contact() {
  const { t, lang } = useLang();
  const alert = useAlert();
  const [vals, setVals] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setVals((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };
  const ctl = (k) => ({
    id: `ct-${k}`,
    name: k,
    value: vals[k],
    onChange: (e) => set(k, e.target.value),
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `ct-${k}-err` : undefined,
  });

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const errs = validateContact(vals, t);
    setErrors(errs);
    if (Object.keys(errs).length) {
      alert.error(t('checkout.fixErrors'));
      document.getElementById(`ct-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await api('/contact', { method: 'POST', lang, body: { lang, ...vals } });
      alert.success(t('contact.sent'));
      setVals(EMPTY);
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      alert.error(err.code === 'network' ? t('err.network') : t('err.server'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" id="contacto">
      <div className="wrap contact">
        <div>
          <h2 className="h2">{t('contact.title')}</h2>
          <p className="lead">{t('contact.sub')}</p>
          {WHATSAPP && (
            <a className="btn ghost" target="_blank" rel="noreferrer" href={`https://wa.me/${WHATSAPP}`}>
              {t('contact.whatsapp')}
            </a>
          )}
        </div>
        <form onSubmit={submit} noValidate className="card-form">
          <Field id="ct-name" label={t('f.name')} error={errors.name}>
            <input {...ctl('name')} autoComplete="name" placeholder={t('f.name.ph')} />
          </Field>
          <Field id="ct-email" label={t('f.email')} error={errors.email}>
            <input {...ctl('email')} type="email" autoComplete="email" placeholder={t('f.email.ph')} />
          </Field>
          <Field id="ct-message" label={t('f.message')} error={errors.message}>
            <textarea {...ctl('message')} rows={4} placeholder={t('f.message.ph')} />
          </Field>
          <button type="submit" className="btn block" disabled={busy}>
            {busy ? t('checkout.sending') : t('contact.send')}
          </button>
        </form>
      </div>
    </section>
  );
}
