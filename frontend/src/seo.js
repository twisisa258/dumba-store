import { useEffect } from 'react';

// URL pública do site (para canonical/OG). Ex.: https://dumba.co.mz
// Sem isto definido, cai para o domínio onde o site está a correr (funciona, mas o ideal é configurar).
const raw = (import.meta.env.VITE_SITE_URL || '').trim().replace(/\/$/, '');
export const SITE_URL = raw || (typeof window !== 'undefined' ? window.location.origin : '');
export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

function setMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
const setName = (name, content) => setMeta('name', name, content);
const setProp = (prop, content) => setMeta('property', prop, content);

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el); }
  el.setAttribute('href', href);
}

// Um único bloco JSON-LD gerido por nós (id fixo); passar `null` remove-o.
function setJsonLd(data) {
  let el = document.getElementById('seo-jsonld');
  if (!data) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('script');
    el.id = 'seo-jsonld';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

// Aplica título + metadados desta página. Chamar com { title, description, path, image, jsonLd }.
// Só ajuda motores de busca que executam JavaScript (o Google executa); a pré-visualização
// de links no WhatsApp/Facebook usa sempre as etiquetas estáticas do index.html.
export function useSeo({ title, description, path = '/', image, jsonLd, noindex = false } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} · Dumba` : 'Dumba · Loja online em Moçambique';
    document.title = fullTitle;
    setName('description', description);
    setName('robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setCanonical(absoluteUrl(path));
    setProp('og:title', fullTitle);
    setProp('og:description', description);
    setProp('og:url', absoluteUrl(path));
    const defaultCover = document.documentElement.lang === 'en' ? '/og-cover-en.png' : '/og-cover.png';
    setProp('og:image', image ? absoluteUrl(image) : absoluteUrl(defaultCover));
    setName('twitter:title', fullTitle);
    setName('twitter:description', description);
    setName('twitter:image', image ? absoluteUrl(image) : absoluteUrl(defaultCover));
    setJsonLd(jsonLd || null);
    return () => setJsonLd(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, image, JSON.stringify(jsonLd), noindex]);
}

// JSON-LD schema.org/Product para a página de um produto.
export function productJsonLd(product, lang) {
  const inStock = (product.variants?.length ? product.variants.some((v) => v.stock > 0) : product.stock > 0);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name?.[lang] || product.name?.pt,
    description: product.description?.[lang] || product.description?.pt,
    image: product.image ? absoluteUrl(product.image) : undefined,
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/produto/${product.slug}`),
      priceCurrency: 'MZN',
      price: product.price,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
}
