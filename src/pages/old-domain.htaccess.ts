import type { APIRoute } from 'astro';
import data from '../data/redirects.json';

// .htaccess для старого домена evro-element.ru: каждый старый адрес сразу ведёт на свою страницу
// нового домена одним 301, всё остальное — на тот же путь нового домена.
// При выкладке на хостинг этот файл кладётся в папку старого домена под именем .htaccess.
export const GET: APIRoute = ({ site }) => {
  const target = (site?.href ?? 'https://kama-filtr.ru/').replace(/\/$/, '');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\-&~# ]/g, '\\$&');
  const rules = Object.entries(data.redirects as Record<string, string>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([from, to]) => `RewriteRule ^${esc(from.replace(/^\/+/, ''))}$ ${target}${to} [R=301,L]`);
  const gone = (data.gone as string[]).map((u) => `RewriteRule ^${esc(u.replace(/^\/+/, ''))}$ - [G,L]`);
  const body = [
    '# Старый домен evro-element.ru переехал. Сгенерировано src/pages/old-domain.htaccess.ts.',
    'RewriteEngine On',
    '',
    ...rules,
    '',
    '# Раздел обмена ссылками удалён',
    'RewriteRule ^affiliation(-[\\d-]+)?\\.html$ - [G,L]',
    ...gone,
    '',
    '# Всё остальное — на тот же адрес нового домена',
    `RewriteRule ^(.*)$ ${target}/$1 [R=301,L]`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
