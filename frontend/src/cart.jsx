import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);
export const MAX_QTY = 20;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('dumba_cart') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function sameLine(item, product, variant) {
  return item.id === product.id && (item.variantId ?? null) === (variant?.id ?? null);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  const [open, setOpen] = useState(false);
  const ref = useRef(items);
  ref.current = items;

  useEffect(() => {
    try { localStorage.setItem('dumba_cart', JSON.stringify(items)); } catch { /* ignora */ }
  }, [items]);

  const add = useCallback((p, variant = null) => {
    const stock = variant ? variant.stock : p.stock;
    const max = Math.min(stock, MAX_QTY);
    const existing = ref.current.find((i) => sameLine(i, p, variant));
    if (existing && existing.qty >= max) return 'max';
    setItems((list) => {
      const found = list.find((i) => sameLine(i, p, variant));
      return found
        ? list.map((i) => (sameLine(i, p, variant) ? { ...i, qty: Math.min(i.qty + 1, max) } : i))
        : [...list, {
          id: p.id,
          qty: 1,
          stock,
          price: p.price,
          name: p.name,
          image: variant?.image || p.image,
          variantId: variant?.id ?? null,
          variantName: variant?.name || null,
          variantColor: variant?.color || null,
        }];
    });
    return 'added';
  }, []);

  const setQty = useCallback((id, qty, variantId = null) => {
    setItems((list) => list
      .map((i) => (i.id === id && (i.variantId ?? null) === variantId
        ? { ...i, qty: Math.max(0, Math.min(qty, i.stock, MAX_QTY)) }
        : i))
      .filter((i) => i.qty > 0));
  }, []);
  const remove = useCallback((id, variantId = null) => setItems((l) => l.filter((i) => !(i.id === id && (i.variantId ?? null) === variantId))), []);
  const clear = useCallback(() => setItems([]), []);

  const sync = useCallback((products) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    setItems((list) => list.map((i) => {
      const p = byId.get(i.id);
      if (!p) return null;
      const variant = p.variants?.find((v) => v.id === i.variantId) || null;
      if (i.variantId && !variant) return null;
      const stock = variant ? variant.stock : p.stock;
      return { ...i, price: p.price, stock, name: p.name, image: variant?.image || p.image, variantName: variant?.name || i.variantName, variantColor: variant?.color || i.variantColor, qty: Math.min(i.qty, stock, MAX_QTY) };
    }).filter((i) => i && i.qty > 0));
  }, []);

  const value = useMemo(() => ({
    items, open, setOpen, add, setQty, remove, clear, sync,
    count: items.reduce((n, i) => n + i.qty, 0),
    total: items.reduce((n, i) => n + i.qty * i.price, 0),
  }), [items, open, add, setQty, remove, clear, sync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
