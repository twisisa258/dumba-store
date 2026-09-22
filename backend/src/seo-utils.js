import { cleanEnv } from './admin-auth.js';

// URL pública da loja (o domínio que aparece no Google), sem barra no fim.
// Ex.: https://dumba.co.mz ou https://dumba.vercel.app
export const siteUrl = () => cleanEnv(process.env.SITE_URL).replace(/\/$/, '');

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

export function buildRobotsTxt(site) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    site && `Sitemap: ${site}/sitemap.xml`,
  ].filter(Boolean).join('\n') + '\n';
}

// Páginas estáticas + uma entrada por produto ativo (/produto/:slug).
// Função pura (sem base de dados) para poder ser testada diretamente.
export function buildSitemapXml(products, site) {
  const url = (path) => `${site}${path}`;
  const staticEntries = [{ loc: url('/'), changefreq: 'daily', priority: '1.0' }];
  const productEntries = products.map((p) => ({
    loc: url(`/produto/${p.slug}`),
    lastmod: isoDate(p.created_at),
    changefreq: 'weekly',
    priority: '0.8',
  }));
  const body = [...staticEntries, ...productEntries]
    .map((e) => `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n${e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : ''}    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Sem SITE_URL configurado devolve só as páginas estáticas com caminhos relativos (não é o recomendado, mas não parte nada).