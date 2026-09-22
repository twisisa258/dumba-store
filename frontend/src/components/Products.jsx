import { useMemo, useState } from 'react';
import { money, useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { MAX_QTY, useCart } from '../cart.jsx';

export default function Products({ products, status, onRetry, onDetails }) {
  const { t, lang } = useLang();
  const alert = useAlert();
  const cart = useCart();
  const [cat, setCat] = useState('all');

  const cats = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const list = cat === 'all' ? products : products.filter((p) => p.category === cat);

  function onAdd(p) {
    if (p.variants?.length) {
      onDetails(p);
      return;
    }
    const r = cart.add(p, null);
    if (r === 'max') alert.warning(t('cart.max', { n: Math.min(p.stock, MAX_QTY) }));
    else alert.success(t('cart.added', { name: p.name[lang] }));
  }

  return (
    <section className="section" id="loja">
      <div className="wrap">
        <h2 className="h2">{t('shop.title')}</h2>

        {status === 'ready' && (
          <div className="chips">
            {['all', ...cats].map((c) => (
              <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === 'all' ? t('shop.all') : t(`cat.${c}`)}
              </button>
            ))}
          </div>
        )}

        {status === 'loading' && (
          <div className="grid" aria-busy="true">
            {[0, 1, 2, 3].map((n) => <div key={n} className="skeleton" />)}
          </div>
        )}

        {status === 'error' && (
          <div className="panel">
            <p>{t('shop.error')}</p>
            <button className="btn" onClick={onRetry}>{t('shop.retry')}</button>
          </div>
        )}

        {status === 'ready' && list.length === 0 && <p className="empty">{t('shop.empty')}</p>}

        {status === 'ready' && list.length > 0 && (
          <div className="grid">
            {list.map((p) => (
              <article className="card" key={p.id}>
                <button className="tile tile-button" type="button" onClick={() => onDetails(p)} aria-label={`${t('product.details')}: ${p.name[lang]}`}>
                  <img src={p.image} alt={p.name[lang]} loading="lazy" />
                  {p.stock === 0 && <span className="tag">{t('shop.out')}</span>}
                  {p.stock > 0 && p.stock <= 3 && <span className="tag hot">{t('shop.low', { n: p.stock })}</span>}
                  <span className="view-badge">{t('product.details')}</span>
                </button>
                <div className="info">
                  <small>{t(`cat.${p.category}`)}</small>
                  <h3>{p.name[lang]}</h3>
                  <p className="desc">{p.description[lang]}</p>
                  <div className="row">
                    <strong>{money(p.price, lang)}</strong>
                    <div className="card-actions">
                      <button className="details-btn" onClick={() => onDetails(p)}>{t('product.details')}</button>
                      <button className="add" disabled={p.stock === 0} onClick={() => onAdd(p)}>
                        + {t('shop.add')}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
