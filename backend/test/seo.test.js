import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotsTxt, buildSitemapXml } from '../src/seo-utils.js';

test('robots.txt aponta para o sitemap e bloqueia /admin', () => {
  const txt = buildRobotsTxt('https://dumba.co.mz');
  assert.match(txt, /Disallow: \/admin/);
  assert.match(txt, /Sitemap: https:\/\/dumba\.co\.mz\/sitemap\.xml/);
});

test('robots.txt sem SITE_URL não quebra (só omite a linha Sitemap)', () => {
  const txt = buildRobotsTxt('');
  assert.doesNotMatch(txt, /Sitemap:/);
  assert.match(txt, /Allow: \//);
});

test('sitemap.xml: XML válido, uma entrada por produto ativo', () => {
  const xml = buildSitemapXml(
    [{ slug: 'smartphone-a04', created_at: '2026-09-01T10:00:00Z' }, { slug: 'sapato-x', created_at: '2026-09-05T10:00:00Z' }],
    'https://dumba.co.mz'
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<url>/g) || []).length, 3); // página inicial + 2 produtos
  assert.match(xml, /<loc>https:\/\/dumba\.co\.mz\/produto\/smartphone-a04<\/loc>/);
  assert.match(xml, /<lastmod>2026-09-01<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/dumba\.co\.mz\/<\/loc>/);
});

test('sitemap.xml escapa caracteres especiais no slug', () => {
  const xml = buildSitemapXml([{ slug: 'a&b<c>', created_at: '2026-01-01' }], 'https://dumba.co.mz');
  assert.match(xml, /a&amp;b&lt;c&gt;/);
  assert.doesNotMatch(xml, /<c>/);
});
