import type { APIRoute } from 'astro';
import data from '../data/redirects.json';
import site from '../data/site.json';

// .htaccess боевого сайта. Собирается вместе с сайтом из redirects.json, поэтому всегда совпадает с каталогом.
// При выкладке на хостинг кладётся в корень под именем .htaccess (см. .github/workflows/beget.yml).
export const GET: APIRoute = () => {
  const host = new URL(import.meta.env.SITE).host;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\-&~# ]/g, '\\$&');
  // https включаем, только когда на хостинге выпущен сертификат (настройка forceHttps), иначе сайт перестанет открываться
  const scheme = site.forceHttps ? 'https' : 'http';
  // полный адрес в цели: старый адрес ведёт сразу на нужную страницу одним переходом, без лишнего шага на https
  const rules = Object.entries(data.redirects as Record<string, string>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([from, to]) => `RewriteRule ^${esc(from.replace(/^\/+/, ''))}$ ${scheme}://${host}${to} [R=301,L]`);
  const canonical = [
    '# Один адрес сайта: без www' + (site.forceHttps ? ' и по https' : ''),
    `RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]`,
    `RewriteRule ^(.*)$ ${scheme}://${host}/$1 [R=301,L]`,
    ...(site.forceHttps
      ? [
          // за nginx Beget протокол виден по заголовку X-Forwarded-Proto
          'RewriteCond %{HTTPS} off',
          'RewriteCond %{HTTP:X-Forwarded-Proto} !https',
          `RewriteRule ^(.*)$ https://${host}/$1 [R=301,L]`,
        ]
      : []),
  ];
  const body = [
    '# Сгенерировано src/pages/main.htaccess.ts. Править redirects.json, а не этот файл.',
    'RewriteEngine On',
    '',
    ...canonical,
    '',
    '# Старые адреса прежнего сайта',
    ...rules,
    '',
    '# Раздел обмена ссылками удалён',
    'RewriteRule ^affiliation(-[\\d-]+)?\\.html$ - [G,L]',
    '',
    '# Служебный файл выкладки не показываем',
    'RewriteRule ^\\.ftp-deploy-sync-state\\.json$ - [F,L]',
    '',
    'ErrorDocument 404 /404.html',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
