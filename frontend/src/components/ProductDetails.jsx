import { useEffect, useMemo, useState } from 'react';
import { money, useLang } from '../i18n.jsx';
import { useAlert } from '../alerts.jsx';
import { MAX_QTY, useCart } from '../cart.jsx';
import { useScrollLock } from '../useScrollLock.js';
import { productJsonLd, useSeo } from '../seo.js';

const colorMap = {
  vermelho: '#d92d3b', red: '#d92d3b',
  azul: '#2f6fed', blue: '#2f6fed',
  branco: '#f4f4f4', white: '#f4f4f4',
  laranja: '#e77b2e', orange: '#e77b2e',
  rosa: '#e78aaa', pink: '#e78aaa',
  preto: '#17191d', black: '#17191d',
  verde: '#3e7454', green: '#3e7454',
  cobre: '#b97852', copper: '#b97852',
};

function swatchColor(label) {
  const key = String(label || '').toLowerCase().trim();
  return colorMap[key] || '#737983';
}

function variantLabel(v, lang) {
  if (!v) return '';
  return v.name?.[lang] || v.name?.pt || v.color || '';
}

export default function ProductDetails({ product, onClose }) {
  const { t, lang } = useLang();
  const alert = useAlert();
  const cart = useCart();
  const [selectedId, setSelectedId] = useState(product.variants?.[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  useScrollLock(true);

  const variants = product.variants || [];
  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) || null,
    [variants, selectedId]
  );
  const stock = selected ? selected.stock : product.stock;
  const image = selected?.image || product.image;

  useSeo({
    path: `/produto/${product.slug}`,
    title: product.name[lang],
    description: product.description?.[lang] || product.description?.pt,
    image,
    jsonLd: productJsonLd(product, lang),
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setQty((q) => Math.min(q, Math.max(1, stock), MAX_QTY));
  }, [stock]);

  function chooseVariant(id) {
    setSelectedId(id);
    setQty(1);
  }

  function addToCart() {
    if (variants.length && !selected) {
      alert.warning(t('product.chooseVariant'));
      return;
    }
    const result = cart.add(product, selected);
    if (result === 'max') alert.warning(t('cart.max', { n: Math.min(stock, MAX_QTY) }));
    else if (result === 'added') {
      alert.success(t('cart.added', { name: product.name[lang] }));
      onClose();
    }
  }

  return (
    <div className="overlay product-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-title">
        <button className="product-close icon-btn" onClick={onClose} aria-label={t('product.close')}>×</button>
        <div className="product-detail-grid">
          <div className="product-gallery">
            <div className="product-main-image">
              <img src={image} alt={product.name[lang]} />
            </div>
            <div className="product-stock-line">
              {stock > 0 ? t('product.stock', { n: stock }) : t('shop.out')}
            </div>
          </div>

          <div className="product-detail-copy">
            <small>{t(`cat.${product.category}`)}</small>
            <h2 id="product-title">{product.name[lang]}</h2>
            <strong className="product-price">{money(product.price, lang)}</strong>
            <p className="product-description">{product.description[lang]}</p>

            {variants.length > 0 && (
              <fieldset className="variant-fieldset">
                <legend>{t('product.chooseColor')}</legend>
                <div className="variant-list">
                  {variants.map((v) => {
                    const active = v.id === selectedId;
                    const label = variantLabel(v, lang);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`variant ${active ? 'selected' : ''} ${v.stock === 0 ? 'disabled' : ''}`}
                        onClick={() => v.stock > 0 && chooseVariant(v.id)}
                        disabled={v.stock === 0}
                        aria-pressed={active}
                        title={label}
                      >
                        <span className="swatch" style={{ background: swatchColor(v.color || label) }} />
                        <span>{label}</span>
                        {v.stock === 0 && <em>{t('shop.out')}</em>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="detail-buy">
              <div className="qty detail-qty" aria-label={t('cart.title')}>
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(Math.max(1, stock), MAX_QTY, q + 1))} disabled={qty >= Math.min(stock, MAX_QTY)}>+</button>
              </div>
              <button className="btn" onClick={addToCart} disabled={stock === 0 || (variants.length > 0 && !selected)}>
                {stock === 0 ? t('shop.out') : t('product.add')}
              </button>
            </div>

            {selected && <p className="selected-variant">{t('product.selected')}: <strong>{variantLabel(selected, lang)}</strong></p>}
          </div>
        </div>
      </div>
    </div>
  );
}
