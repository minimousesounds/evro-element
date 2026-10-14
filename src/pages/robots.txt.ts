import type { APIRoute } from 'astro';

// Временная копия (GitHub Pages) полностью закрыта от поисковиков
const preview = import.meta.env.PUBLIC_PREVIEW === '1';

export const GET: APIRoute = ({ site }) => {
  const lines = preview
    ? ['User-agent: *', 'Disallow: /']
    : [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin/',
        'Disallow: /cart/',
        'Disallow: /checkout/',
        'Disallow: /order-done/',
        'Disallow: /search/',
        '',
        `Sitemap: ${new URL('sitemap-index.xml', site).href}`,
      ];
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
