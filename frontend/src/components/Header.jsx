import { useLang } from '../i18n.jsx';
import { useCart } from '../cart.jsx';

export default function Header() {
  const { t, lang, toggle } = useLang();
  const { count, setOpen } = useCart();
  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <a href="#top" className="brand" aria-label="Dumba">
          <img src="/logo-horizontal.png" alt="Dumba" />
        </a>
        <nav className="nav">
          <a href="#loja">{t('nav.shop')}</a>
          <a href="#como">{t('nav.how')}</a>
          <a href="#contacto">{t('nav.contact')}</a>
        </nav>
        <div className="hdr-actions">
          <button className="lang" onClick={toggle} aria-label={t('lang.aria')}>
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
          <button className="cart-btn" onClick={() => setOpen(true)} aria-label={t('nav.cart')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8h14l-1.2 11H6.2L5 8z" />
              <path d="M9 8V6.5a3 3 0 016 0V8" />
            </svg>
            {count > 0 && <span className="badge">{count}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}
