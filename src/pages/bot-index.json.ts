import type { APIRoute } from 'astro';
import { getCategories, getProducts } from '../lib/catalog';

// Служебный список для Telegram-бота: какие товары и категории есть и где лежат их файлы.
export const GET: APIRoute = async () => {
  const categories = (await getCategories()).map((c) => ({ id: c.id, title: c.data.title }));
  // скрытые тоже: бот вернёт товар на сайт, если отец снова пришлёт по нему цену
  const products = (await getProducts(true)).map((p) => ({
    id: p.id,
    path: `src/content/products/${p.id}.md`,
    sku: p.data.sku,
    title: p.data.title,
    price: p.data.price,
    inStock: p.data.inStock,
    category: p.data.category.id,
    kind: p.data.kind,
    brand: p.data.brand,
    images: p.data.images.length,
    ...(p.data.hidden ? { hidden: true } : {}),
  }));
  return new Response(JSON.stringify({ categories, products }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
