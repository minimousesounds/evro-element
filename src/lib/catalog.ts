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

/** Фильтр или фильтрующий элемент: для них «аналог» значит совпадение размеров, резьбы и уплотнения. */
export const isFilter = (p: Product) => /^(filtr|element)-/.test(p.data.category.id);

/** Пояснение к аналогу: для фильтров про размеры и резьбу, для остальных деталей общее. */
export const analogNote = (p: Product) =>
  isFilter(p)
    ? 'Посадочные размеры, резьба и уплотнение совпадают с оригиналом, фильтр встаёт на штатное место.'
    : 'Деталь совместима с оригиналом и ставится на штатное место.';

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

/** Страница «Запчасти для техники»: правила подбора товаров из src/data/machines.json. */
export interface Machine {
  slug: string;
  /** подпись на кнопке в каталоге */
  short: string;
  title: string;
  seoTitle: string;
  intro: string;
  text: string;
  brands?: string[];
  categories?: string[];
  titleMatch?: string;
  skuMatch?: string;
}

export const machineUrl = (m: Machine) => `/tehnika/${m.slug}/`;

export function machineProducts(m: Machine, products: Product[]): Product[] {
  const title = m.titleMatch ? new RegExp(m.titleMatch, 'i') : null;
  const sku = m.skuMatch ? new RegExp(m.skuMatch, 'i') : null;
  return products.filter(
    (p) =>
      m.brands?.includes(p.data.brand) ||
      m.categories?.includes(p.data.category.id) ||
      (title && title.test(p.data.title)) ||
      (sku && sku.test(p.data.sku)),
  );
}

/** Простой текст с заголовками «## » и абзацами в HTML. */
export function simpleMarkdown(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((b) => (b.startsWith('## ') ? `<h2>${esc(b.slice(3))}</h2>` : `<p>${esc(b).replace(/\n/g, '<br />')}</p>`))
    .join('\n');
}
