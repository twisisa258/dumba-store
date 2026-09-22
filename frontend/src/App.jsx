import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from './i18n.jsx';
import { useAlert } from './alerts.jsx';
import { useCart } from './cart.jsx';
import { api } from './api.js';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Products from './components/Products.jsx';
import ProductDetails from './components/ProductDetails.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import AdminApp from './admin.jsx';
import { useSeo } from './seo.js';

export default function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminApp /> : <Shop />;
}

function Shop() {
  const { t, lang } = useLang();
  const alert = useAlert();
  const cart = useCart();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [checkout, setCheckout] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Cada produto tem um endereço próprio (/produto/:slug): pode ser partilhado, indexado pelo
  // Google e funciona com o botão "Voltar" do telemóvel.
  const slugFromPath = () => {
    const m = window.location.pathname.match(/^\/produto\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  };
  const openProduct = (p, { push = true } = {}) => {
    setSelectedProduct(p);
    if (push) window.history.pushState({}, '', `/produto/${p.slug}`);
  };
  const closeProduct = () => {
    setSelectedProduct(null);
    if (slugFromPath()) window.history.pushState({}, '', '/');
  };
  const productsRef = useRef(products);
  productsRef.current = products;
  useEffect(() => {
    const onPop = () => {
      const slug = slugFromPath();
      setSelectedProduct(slug ? productsRef.current.find((p) => p.slug === slug) || null : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    const slow = setTimeout(() => alert.info(t('shop.slow')), 5000);
    try {
      const data = await api('/products', { lang });
      setProducts(data);
      cart.sync(data);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      alert.error(e.code === 'network' ? t('err.network') : t('err.server'));
    } finally {
      clearTimeout(slow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Abriu-se diretamente um link de produto (partilhado, ou indexado no Google): assim que a
  // lista chega, mostra esse produto sem passar pela página inicial.
  useEffect(() => {
    const slug = slugFromPath();
    if (slug && products.length && !selectedProduct) {
      const p = products.find((x) => x.slug === slug);
      if (p) setSelectedProduct(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  useSeo({ path: '/', description: t('meta.home.description') });

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Products products={products} status={status} onRetry={load} onDetails={openProduct} />
        <HowItWorks />
        <Contact />
      </main>
      <Footer />
      <CartDrawer onCheckout={() => setCheckout(true)} />
      {checkout && <CheckoutModal onClose={() => setCheckout(false)} />}
      {selectedProduct && <ProductDetails product={selectedProduct} onClose={closeProduct} />}
    </>
  );
}
