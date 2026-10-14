// Список товаров и категорий берём из служебного файла сайта /bot-index.json.

export interface CatalogProduct {
  id: string;
  path: string;
  sku: string;
  title: string;
  price: number;
  inStock: boolean;
  category: string;
  kind: '' | 'original' | 'analog';
  brand: string;
  images: number;
}

export interface Catalog {
  categories: { id: string; title: string }[];
  products: CatalogProduct[];
}

export async function loadCatalog(url: string): Promise<Catalog> {
  // свежая копия: после правок сайт пересобирается, кэш здесь только мешает
  const res = await fetch(`${url}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Не загрузился список товаров: ${res.status}`);
  return (await res.json()) as Catalog;
}

/** Сравнение артикулов без учёта регистра, пробелов, дефисов и похожих кириллических букв. */
export function normSku(s: string): string {
  const lookalike: Record<string, string> = { а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x' };
  return s
    .toLowerCase()
    .replace(/[авекмнорстух]/g, (c) => lookalike[c])
    .replace(/[\s\-_.\/]+/g, '');
}

export function findBySku(catalog: Catalog, sku: string): CatalogProduct | undefined {
  const n = normSku(sku);
  return catalog.products.find((p) => normSku(p.sku) === n);
}
