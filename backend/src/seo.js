import { Router } from 'express';
import { query } from './db.js';
import { buildRobotsTxt, buildSitemapXml, siteUrl } from './seo-utils.js';

export const seoRouter = Router();

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(buildRobotsTxt(siteUrl()));
});

// Sem SITE_URL configurado devolve só a página inicial com caminho relativo (não é o recomendado, mas não parte nada).
seoRouter.get('/sitemap.xml', async (_req, res) => {
  const { rows } = await query(`select slug, created_at from products where active order by id`);
  res.type('application/xml').set('Cache-Control', 'public, max-age=1800').send(buildSitemapXml(rows, siteUrl()));
});
