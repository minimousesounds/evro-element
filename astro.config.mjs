import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Боевой адрес по умолчанию. Для временной копии на GitHub Pages сборка получает
// SITE_URL и SITE_BASE (подпапка) из .github/workflows/deploy.yml.
const site = process.env.SITE_URL || 'https://www.evro-element.ru';
const base = process.env.SITE_BASE || '/';

/** Ссылки в шаблонах написаны от корня («/catalog/»). В подпапке дописываем к ним base. */
function prefixBase() {
  return {
    name: 'prefix-base',
    hooks: {
      'astro:build:done': ({ dir }) => {
        if (base === '/') return;
        const prefix = base.replace(/\/$/, '');
        const walk = (d) => {
          for (const f of readdirSync(d)) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.html')) {
              const html = readFileSync(p, 'utf8');
              // ссылки, которые Astro уже собрал с base (стили, скрипты), не трогаем
              const out = html.replace(/\b(href|src|action|data-url|data-image)="(\/[^"]*)"/g, (m, attr, url) =>
                url.startsWith('//') || url === prefix || url.startsWith(prefix + '/') ? m : `${attr}="${prefix}${url}"`);
              if (out !== html) writeFileSync(p, out);
            }
          }
        };
        walk(fileURLToPath(dir));
      },
    },
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // служебные страницы в карту сайта не попадают
      filter: (page) => !/\/(cart|checkout|order-done|search|admin)\//.test(page),
    }),
    prefixBase(),
  ],
});
