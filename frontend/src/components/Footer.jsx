import { useState } from 'react';
import { useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { api } from '../api.js';
import { isEmail } from '../validate.js';

export default function Footer() {
  const { t, lang } = useLang();
  const alert = useAlert();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!isEmail(email)) {
      setError(t('err.invalid_email'));
      alert.error(t('err.invalid_email'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api('/newsletter', { method: 'POST', lang, body: { lang, email: email.trim() } });
      alert.success(t('news.ok'));
      setEmail('');
    } catch (err) {
      alert.error(err.code === 'network' ? t('err.network') : t('err.server'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <div className="news">
          <h3>{t('news.title')}</h3>
          <form onSubmit={submit} noValidate>
            <div className={`inline${error ? ' has-err' : ''}`}>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder={t('f.email.ph')}
                autoComplete="email"
                aria-label={t('f.email')}
                aria-invalid={error ? true : undefined}
              />
              <button className="btn" type="submit" disabled={busy}>{t('news.btn')}</button>
            </div>
            {error && <p className="msg err" role="alert">{error}</p>}
          </form>
        </div>
        <div className="legal">
          <img src="/icon.png" alt="" width="44" height="44" />
          <span>{t('footer.rights')}</span>
        </div>
      </div>
    </footer>
  );
}
