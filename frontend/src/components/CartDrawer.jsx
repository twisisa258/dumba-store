import { useEffect } from 'react';
import { money, useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { MAX_QTY, useCart } from '../cart.jsx';
import { useScrollLock } from '../useScrollLock.js';

export default function CartDrawer({ onCheckout }) {
  const { t, lang } = useLang();
  const alert = useAlert();
  const { items, total, open, setOpen, setQty, remove, clear } = useCart();
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  async function clearAll() {
    const ok = await alert.confirm({
      title: t('cart.clearTitle'),
      message: t('cart.clearText'),
      confirmText: t('cart.clear'),
      danger: true,
    });
    if (ok) clear();
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t('cart.title')}>
        <div className="drawer-head">
          <h2>{t('cart.title')}</h2>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t('cart.close')}>×</button>
        </div>

        {items.length === 0 ? (
          <p className="empty">{t('cart.empty')}</p>
        ) : (
          <>
            <ul className="lines">
              {items.map((i) => (
                <li key={`${i.id}:${i.variantId ?? ''}`}>
                  <img src={i.image} alt="" />
                  <div>
                    <h3>{i.name[lang]}</h3>
                    <p>{i.variantName?.[lang] || i.variantName?.pt || i.variantColor || ''}{(i.variantName || i.variantColor) ? ' · ' : ''}{money(i.price, lang)}</p>
                    <div className="qty">
                      <button aria-label={t('cart.less')} onClick={() => setQty(i.id, i.qty - 1, i.variantId)}>−</button>
                      <span>{i.qty}</span>
                      <button
                        aria-label={t('cart.more')}
                        onClick={() => setQty(i.id, i.qty + 1, i.variantId)}
                        disabled={i.qty >= Math.min(i.stock, MAX_QTY)}
                      >+</button>
                    </div>
                  </div>
                  <button className="link-btn" onClick={() => remove(i.id, i.variantId)}>{t('cart.remove')}</button>
                </li>
              ))}
            </ul>
            <div className="drawer-foot">
              <div className="total"><span>{t('cart.total')}</span><strong>{money(total, lang)}</strong></div>
              <button className="btn block" onClick={() => { setOpen(false); onCheckout(); }}>{t('cart.checkout')}</button>
              <button className="link-btn center" onClick={clearAll}>{t('cart.clear')}</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
