import { useEffect, useState } from 'react';
import { useLang } from '../i18n.jsx';

const WORDS = ['hero.w1', 'hero.w2', 'hero.w3', 'hero.w4', 'hero.w5'];
const KEYS = ['hero.k1', 'hero.k2', 'hero.k3', 'hero.k4'];
const TICKS = ['tick.1', 'tick.2', 'tick.3', 'tick.4', 'tick.5', 'tick.6'];

export default function Hero() {
  const { t } = useLang();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero" id="top">
      <div className="wrap hero-layout">
        <div className="hero-copy">
          <span className="pill"><i className="dot" />{t('hero.kicker')}</span>
          <h1 aria-label={t('hero.aria')}>
            <span aria-hidden="true">
              {t('hero.lead')}
              <span key={i} className="rot">{t(WORDS[i])}</span>
            </span>
          </h1>
          <p className="lead">{t('hero.sub')}</p>
          <div className="hero-cta">
            <a className="btn" href="#loja">{t('hero.cta')}</a>
            <a className="btn ghost" href="#contacto">{t('hero.cta2')}</a>
          </div>
          <ul className="keys">
            {KEYS.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src="/hero-3d.png" alt="" />
        </div>
      </div>
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...TICKS, ...TICKS].map((k, n) => (
            <span key={n}>{t(k)}<b>✦</b></span>
          ))}
        </div>
      </div>
    </section>
  );
}
