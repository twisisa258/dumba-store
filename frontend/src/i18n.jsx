import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import pt from './locales/pt.js';
import en from './locales/en.js';

const dict = { pt, en };
const Ctx = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem('dumba_lang');
    if (saved === 'pt' || saved === 'en') return saved;
  } catch { /* sem acesso ao armazenamento */ }
  return (navigator.language || 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt';
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('dumba_lang', lang); } catch { /* ignora */ }
  }, [lang]);

  const t = useCallback((key, vars) => {
    let s = dict[lang][key] ?? dict.pt[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    return s;
  }, [lang]);

  const value = useMemo(
    () => ({ lang, t, setLang, toggle: () => setLang((l) => (l === 'pt' ? 'en' : 'pt')) }),
    [lang, t]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export const money = (n, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'pt-PT').format(n) + ' MT';
