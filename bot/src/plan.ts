// Из действий модели собираем проверенный план: что именно поменяется и как это сказать человеку.
import type { Action } from './parse';
import { findBySku, type Catalog, type CatalogProduct } from './catalog';
import { uniqueSlug, type NewProduct } from './content';

export type Change =
  | { kind: 'update'; productId: string; path: string; sku: string; title: string; price?: number; inStock?: boolean; newTitle?: string; brand?: string; productKind?: 'original' | 'analog'; category?: string; addPhoto?: boolean; unhide?: boolean }
  | { kind: 'create'; slug: string; product: NewProduct; addPhoto: boolean };

export interface Plan {
  changes: Change[];
  /** Ответы без изменений (на вопросы «сколько стоит»). */
  info: string[];
  /** Что не получилось понять: показываем владельцу. */
  problems: string[];
}

const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')} ₽`;
const kindLabel = (k?: string) => (k === 'analog' ? 'аналог' : k === 'original' ? 'оригинал' : '');

/** ASAS на сайте не упоминаем (решение владельца): такой бренд просто не записываем. */
const cleanBrand = (b: string | null) => (b && !/^asas(\s*-?\s*filter)?$/i.test(b.trim()) ? b.trim() : '');

export function buildPlan(actions: Action[], catalog: Catalog, hasPhoto: boolean): Plan {
  const plan: Plan = { changes: [], info: [], problems: [] };
  const updates = new Map<string, Extract<Change, { kind: 'update' }>>();
  const taken = new Set(catalog.products.map((p) => p.id));
  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  let photoUsed = false;

  const update = (p: CatalogProduct) => {
    let u = updates.get(p.id);
    if (!u) {
      u = { kind: 'update', productId: p.id, path: p.path, sku: p.sku, title: p.title };
      updates.set(p.id, u);
      plan.changes.push(u);
    }
    return u;
  };

  for (const a of actions) {
    const p = findBySku(catalog, a.sku);
    if (a.type === 'info') {
      if (p) plan.info.push(`${p.sku} ${p.title}: ${money(p.price)}, ${p.inStock ? 'в наличии' : 'нет в наличии'}${p.hidden ? ', сейчас снят с сайта' : ''}`);
      else plan.info.push(`${a.sku}: такого артикула на сайте нет`);
      continue;
    }
    if (a.type === 'create' && !p) {
      const missing = [!a.title && 'название', a.price == null && 'цену', !(a.category && categoryIds.has(a.category)) && 'категорию'].filter(Boolean);
      if (missing.length) {
        plan.problems.push(`Чтобы добавить ${a.sku}, напишите ещё ${missing.join(', ')}.`);
        continue;
      }
      const slug = uniqueSlug(a.sku, taken);
      taken.add(slug);
      const addPhoto: boolean = hasPhoto && !photoUsed;
      photoUsed ||= addPhoto;
      plan.changes.push({
        kind: 'create',
        slug,
        addPhoto,
        product: { sku: a.sku.trim(), title: a.title!, category: a.category!, price: a.price!, inStock: a.in_stock ?? true, kind: a.kind ?? '', brand: cleanBrand(a.brand), images: [] },
      });
      continue;
    }
    if (!p) {
      plan.problems.push(`Не нашёл на сайте артикул ${a.sku}.`);
      continue;
    }
    const u = update(p);
    if (a.price != null && a.price !== p.price) u.price = a.price;
    if (a.in_stock != null && a.in_stock !== p.inStock) u.inStock = a.in_stock;
    if (a.type === 'create' || a.type === 'edit') {
      if (a.title && a.title !== p.title) u.newTitle = a.title;
      if (cleanBrand(a.brand) && cleanBrand(a.brand) !== p.brand) u.brand = cleanBrand(a.brand);
      if (a.kind && a.kind !== p.kind) u.productKind = a.kind;
      if (a.category && a.category !== p.category && categoryIds.has(a.category)) u.category = a.category;
    }
    if ((a.type === 'photo' || a.type === 'create') && hasPhoto && !photoUsed) {
      u.addPhoto = true;
      photoUsed = true;
    }
    // скрытый товар возвращается на сайт, если его продают снова (не «кончился»)
    if (p.hidden && a.in_stock !== false) u.unhide = true;
  }

  // действия, которые ничего не меняют (цена и так такая), не показываем
  plan.changes = plan.changes.filter(
    (c) => c.kind === 'create' || c.price != null || c.inStock != null || c.newTitle || c.brand || c.productKind || c.category || c.addPhoto || c.unhide,
  );
  if (hasPhoto && !photoUsed && actions.length) plan.problems.push('Не понял, к какому товару фото. Напишите артикул в подписи.');
  return plan;
}

/** Текст для подтверждения: по строке на изменение. */
export function describe(plan: Plan, catalog: Catalog): string[] {
  const cat = (id: string) => catalog.categories.find((c) => c.id === id)?.title ?? id;
  return plan.changes.map((c) => {
    if (c.kind === 'create') {
      const p = c.product;
      const extra = [kindLabel(p.kind) && `${kindLabel(p.kind)}${p.brand ? ` ${p.brand}` : ''}`, p.inStock ? 'в наличии' : 'нет в наличии', c.addPhoto && 'с фото'].filter(Boolean);
      return `➕ Новый товар ${p.sku} ${p.title}, ${money(p.price)}, «${cat(p.category)}», ${extra.join(', ')}`;
    }
    const parts: string[] = [];
    const old = catalog.products.find((p) => p.id === c.productId)!;
    if (c.price != null) parts.push(`цена ${money(old.price)} → ${money(c.price)}`);
    if (c.inStock != null) parts.push(c.inStock ? 'теперь в наличии' : 'нет в наличии');
    if (c.newTitle) parts.push(`название «${c.newTitle}»`);
    if (c.productKind) parts.push(kindLabel(c.productKind));
    if (c.brand) parts.push(`бренд ${c.brand}`);
    if (c.category) parts.push(`категория «${cat(c.category)}»`);
    if (c.addPhoto) parts.push('новое фото');
    if (c.unhide) parts.push('вернётся на сайт');
    return `• ${c.sku} ${c.title}: ${parts.join(', ')}`;
  });
}

/** Короткое описание для коммита. */
export function commitMessage(plan: Plan): string {
  const head = plan.changes
    .map((c) => (c.kind === 'create' ? `новый ${c.product.sku}` : `${c.sku}${c.price != null ? ` цена ${c.price}` : ''}${c.inStock != null ? (c.inStock ? ' в наличии' : ' нет в наличии') : ''}${c.addPhoto ? ' фото' : ''}`))
    .join(', ');
  return `Бот: ${head}`.slice(0, 120);
}
