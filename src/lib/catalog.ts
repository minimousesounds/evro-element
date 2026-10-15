import { getCollection, type CollectionEntry } from 'astro:content';
import site from '../data/site.json';

export type Product = CollectionEntry<'products'>;
export type Category = CollectionEntry<'categories'>;

/** Категории, в которых есть хотя бы один товар на сайте. */
export async function getCategories(): Promise<Category[]> {
  const used = new Set((await getProducts()).map((p) => p.data.category.id));
  return (await getCollection('categories', (c) => used.has(c.id))).sort((a, b) => a.data.order - b.data.order);
}

export async function getProducts(all = false): Promise<Product[]> {
  return (await getCollection('products', (p) => all || !p.data.hidden)).sort((a, b) => a.data.sku.localeCompare(b.data.sku, 'ru', { numeric: true }));
}

export const categoryUrl = (c: Category | string) => `/catalog/${typeof c === 'string' ? c : c.id}/`;
export const productUrl = (p: Product) => `/catalog/${p.data.category.id}/${p.id}/`;

/** «за штуку» или «за комплект» для подписи к цене. */
export const perUnit = (unit: string) => (unit.startsWith('компл') ? 'за комплект' : 'за штуку');

export const formatPrice = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n).replace(/\u00a0/g, ' ') + ' ₽';

/** Подпись под артикулом: бренд, «аналог …» или «оригинал …». */
export function brandLabel(p: Product): string {
  const { brand, kind, country } = p.data;
  if (kind === 'analog') return brand ? `аналог ${brand}` : 'аналог';
  if (kind === 'original') return brand ? `оригинал ${brand}` : 'оригинал';
  return brand || country || '';
}

/** Название с артикулом для заголовков и поиска. */
export function fullName(p: Product): string {
  const { title, sku } = p.data;
  return title.toLowerCase().includes(sku.toLowerCase()) ? title : `${title} ${sku}`;
}

export function productSeo(p: Product) {
  const label = brandLabel(p);
  const base = `${fullName(p)}${label ? ` (${label})` : ''}`;
  return {
    title: p.data.seoTitle || `${base} — купить в ${site.city === 'Набережные Челны' ? 'Набережных Челнах' : site.city}`,
    description:
      p.data.seoDescription ||
      `${base}: цена ${formatPrice(p.data.price)}, ${p.data.inStock ? 'в наличии' : 'под заказ'}. Самовывоз в Набережных Челнах и отправка транспортной компанией. ${site.name}, ${site.phone}.`,
  };
}

export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
export const positions = (n: number) => `${n} ${plural(n, ['позиция', 'позиции', 'позиций'])}`;
