// Загрузка прайса (xls/xlsx в формате «для Автопитера») в каталог. Тот же разбор, что в scripts/import_price.py:
// совпавшие по артикулу товары обновляются, новые создаются, отсутствующие скрываются, редиректы пересчитываются.
// Чтение файла отделено от разбора, чтобы разбор можно было проверить тестами без Excel.
import * as XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import type { FileChange } from './github';

XLSX.set_cptable(cptable);

export interface PriceRow {
  sku: string;
  brandRaw: string;
  name: string;
  unit: 'шт.' | 'компл.';
  price: number;
  qty: number;
  min: number;
}

/** Что лежит в репозитории: тексты файлов товаров и категорий по slug, карта редиректов. */
export interface RepoState {
  products: Record<string, string>;
  categories: Record<string, string>;
  redirects: { redirects: Record<string, string>; gone: string[] };
}

export interface PriceStats {
  total: number;
  priceChanged: { sku: string; from: number; to: number }[];
  ranOut: string[];
  backInStock: string[];
  created: string[];
  unhidden: string[];
  hidden: string[];
}

const NEW_CATEGORIES: Record<string, [string, number]> = {
  'nasosy-vodyanye-kamaz': ['Насосы водяные КамАЗ и ремкомплекты', 11],
  podshipniki: ['Подшипники', 12],
  'kronshtejny-i-korpusa-filtrov': ['Кронштейны и корпуса фильтров', 13],
};
// первое совпадение по названию задаёт категорию
const RULES: [RegExp, string][] = [
  [/элемент масляного/, 'element-maslyanogo-filtra'],
  [/элемент топливного/, 'element-toplivnogo-filtra'],
  [/кронштейн|корпус .*фильтра/, 'kronshtejny-i-korpusa-filtrov'],
  [/фильтр масляный/, 'filtr-maslyanyj'],
  [/фильтр топливный/, 'filtr-toplivnyj'],
  [/фильтр воздушный/, 'filtr-vozdushnyj'],
  [/фильтр гидравлический/, 'filtr-gidravlicheskij'],
  [/помп|насоса? водян|р\/к насоса|фибра|шкив насоса/, 'nasosy-vodyanye-kamaz'],
  [/подшипник/, 'podshipniki'],
];
const BRANDS: Record<string, string> = {
  // ASAS на сайте не упоминаем (решение владельца): бренд пустой, пометка «аналог»
  asas: '', claas: 'Claas', 'new holland': 'New Holland', caterpillar: 'Caterpillar', komatsu: 'Komatsu',
  'jcb landpower': 'JCB', камаз: 'КамАЗ', vspz: 'VSPZ', 'hifi filter': 'HiFi Filter', 'mann+hummel': 'Mann+Hummel',
  donaldson: 'Donaldson', racor: 'Racor', белзан: 'БелЗАН', уралаз: 'УралАЗ',
};
const COUNTRIES: Record<string, string> = { россия: 'Россия', китай: 'Китай', германия: 'Германия' };
const TYPOS: [string, string][] = [['колпачек', 'колпачок'], ['мотром', 'мотором'], ['Самавра', 'Самара']];
// кириллические буквы, похожие на латинские, в артикулах
const HOMOGLYPHS: Record<string, string> = Object.fromEntries(
  [...'АВСЕНКМОРТХавсеокмртх'].map((c, i) => [c, 'ABCEHKMOPTXabceokmptx'[i]]),
);
const TRANSLIT: Record<string, string> = Object.fromEntries(
  [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'].map((c, i) =>
    [c, ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'h', 'c', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya'][i]]),
);
// \b в JS не понимает кириллицу, поэтому границы слова задаём явно
const W = (word: string) => `(?<!\\p{L})${word}(?!\\p{L})`;

const q = (s: string) => JSON.stringify(s);
const deHomoglyph = (s: string) => [...s].map((c) => HOMOGLYPHS[c] ?? c).join('');
const slugify = (s: string) => deHomoglyph(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const translitSlug = (s: string) => slugify([...s.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join(''));
const normSku = (s: string) => deHomoglyph(s).toLowerCase().replace(/[^0-9a-z]/g, '');

function cellText(v: unknown): string {
  if (typeof v === 'number') return String(v);
  return v == null ? '' : String(v).trim();
}

/** Строки прайса из файла Excel. Пустой список, если не нашлась строка заголовков «Артикул». */
export function readPrice(data: ArrayBuffer | Uint8Array): PriceRow[] {
  const book = XLSX.read(data, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: '' });
  return parseRows(rows);
}

export function parseRows(rows: unknown[][]): PriceRow[] {
  const head = rows.findIndex((r) => cellText(r[0]).toLowerCase() === 'артикул');
  if (head === -1) return [];
  const out: PriceRow[] = [];
  for (const r of rows.slice(head + 1)) {
    // Excel иногда сохраняет числовой артикул текстом с хвостом «.0»
    const sku = cellText(r[0]).replace(/^(\d+)\.0$/, '$1');
    const name = cellText(r[2]).replace(/\s+/g, ' ');
    if (!sku || !name) continue;
    out.push({
      sku, name, brandRaw: cellText(r[1]),
      unit: cellText(r[3]).toLowerCase().startsWith('к') ? 'компл.' : 'шт.',
      price: Number(r[4]) || 0, qty: Number(r[5]) || 0, min: Math.max(1, Math.trunc(Number(r[6]) || 1)),
    });
  }
  return out;
}

/** Название, бренд, исполнение, страна и категория из строки прайса. */
export function describeRow(row: PriceRow) {
  let name = row.name;
  const raw = row.brandRaw.trim();
  for (const [a, b] of TYPOS) name = name.replaceAll(a, b);
  const low = name.toLowerCase();
  let country = COUNTRIES[raw.toLowerCase()] ?? '';
  const brand: string = country ? '' : BRANDS[raw.toLowerCase()] ?? raw;
  let m = name.match(/\s*пр-во\s+(\S+)/i);
  if (m) {
    country = COUNTRIES[m[1].toLowerCase()] ?? m[1];
    name = name.slice(0, m.index) + name.slice(m.index! + m[0].length);
  }
  m = name.match(/\s+(китай|германия|россия)$/i);
  if (m) {
    country = COUNTRIES[m[1].toLowerCase()];
    name = name.slice(0, m.index);
  }
  let kind: '' | 'original' | 'analog' = '';
  if (low.includes('оригинал')) {
    kind = 'original';
    name = name.replace(new RegExp(`\\s*${W('оригинал')}.*$`, 'iu'), '');
  } else if (low.includes('аналог') || raw.toLowerCase() === 'asas' || (brand === 'Claas' && country)) {
    kind = 'analog';
  }
  name = name.replace(new RegExp(`\\s*${W('аналог')}\\s*`, 'giu'), ' ').replace(/^[ ,]+|[ ,]+$/g, '');
  name = name.replace(/^(Рк|Р\/к)\s/, 'Ремкомплект ');
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const category = RULES.find(([re]) => re.test(low))?.[1] ?? 'zapchasti';
  return { title: name, brand, kind, country, category };
}

function setField(text: string, key: string, value: string): string {
  const line = `${key}: ${value}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(text)) return text.replace(re, () => line);
  const end = text.indexOf('\n---', 3);
  return `${text.slice(0, end)}\n${line}${text.slice(end)}`;
}

function getField(text: string, key: string): string {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
}

/** Применяет прайс к содержимому репозитория. Возвращает изменённые файлы и сводку для подтверждения. */
export function applyPrice(rows: PriceRow[], state: RepoState, hideMissing: boolean): { files: FileChange[]; stats: PriceStats } {
  const files: Record<string, string> = { ...state.products };
  const bySku = new Map<string, string[]>();
  for (const slug of Object.keys(files).sort()) {
    const k = normSku(getField(files[slug], 'sku'));
    bySku.set(k, [...(bySku.get(k) ?? []), slug]);
  }
  const stats: PriceStats = { total: rows.length, priceChanged: [], ranOut: [], backInStock: [], created: [], unhidden: [], hidden: [] };
  const seen = new Set<string>();

  for (const row of rows) {
    const d = describeRow(row);
    const inStock = row.qty > 0;
    const fields: Record<string, string> = {
      title: q(d.title), brand: q(d.brand), kind: q(d.kind), category: d.category, price: String(row.price),
      inStock: String(inStock), unit: q(row.unit), minQty: String(row.min), country: q(d.country), hidden: 'false',
    };
    // на старом сайте часть артикулов записана с лишним нулём на конце (9846710 вместо 984671)
    const candidates = bySku.get(normSku(row.sku)) ?? bySku.get(normSku(row.sku) + '0') ?? [];
    let slug = candidates.find((s) => !seen.has(s));
    if (slug) {
      let text = files[slug];
      const oldPrice = Number(getField(text, 'price'));
      const wasInStock = getField(text, 'inStock') !== 'false';
      if (oldPrice !== row.price) stats.priceChanged.push({ sku: row.sku, from: oldPrice, to: row.price });
      if (wasInStock && !inStock) stats.ranOut.push(row.sku);
      if (!wasInStock && inStock) stats.backInStock.push(row.sku);
      if (getField(text, 'hidden') === 'true') stats.unhidden.push(row.sku);
      for (const [k, v] of Object.entries({ ...fields, sku: q(row.sku) })) text = setField(text, k, v);
      files[slug] = text;
    } else {
      const base = slugify(row.sku) || 'tovar';
      slug = base;
      if (slug in files) slug = `${base}-${translitSlug(d.brand || d.country) || '2'}`;
      for (let n = 2; slug in files; n++) slug = `${base}-${n}`;
      const f: Record<string, string> = { ...fields, sku: q(row.sku) };
      files[slug] = `---\n${Object.entries({
        title: f.title, sku: f.sku, brand: f.brand, kind: f.kind, category: f.category, price: f.price, inStock: f.inStock,
        unit: f.unit, minQty: f.minQty, popular: 'false', offer: 'false', images: '[]', replaces: '[]', specs: '[]',
        country: f.country, applicability: '""', seoTitle: '""', seoDescription: '""', hidden: 'false',
      }).map(([k, v]) => `${k}: ${v}\n`).join('')}---\n`;
      stats.created.push(row.sku);
    }
    seen.add(slug);
  }

  if (hideMissing) {
    for (const slug of Object.keys(files)) {
      if (seen.has(slug) || getField(files[slug], 'hidden') === 'true') continue;
      files[slug] = setField(files[slug], 'hidden', 'true');
      stats.hidden.push(getField(files[slug], 'sku'));
    }
  }

  const categories = { ...state.categories };
  for (const [slug, [title, order]] of Object.entries(NEW_CATEGORIES)) {
    categories[slug] ??= `---\ntitle: ${q(title)}\norder: ${order}\nimage: ""\nseoTitle: ""\nseoDescription: ""\n---\n`;
  }

  // редиректы: старый адрес товара ведёт на его новый адрес, скрытого — на категорию
  const productCat = Object.fromEntries(Object.entries(files).map(([s, t]) => [s, getField(t, 'category')]));
  const visible = (s: string) => getField(files[s], 'hidden') !== 'true';
  const used = new Set(Object.keys(files).filter(visible).map((s) => productCat[s]));
  const redirects = { ...state.redirects, redirects: { ...state.redirects.redirects } };
  // старый адрес товара всегда /shop/view-<oldId>.html: по нему находим товар, даже если редирект уже вёл в категорию
  const byOldUrl = new Map<string, string>();
  for (const [s, t] of Object.entries(files)) {
    const id = getField(t, 'oldId');
    if (id) byOldUrl.set(`/shop/view-${id}.html`, s);
  }
  for (const [old, target] of Object.entries(redirects.redirects)) {
    const parts = target.replace(/^\/|\/$/g, '').split('/');
    const slug = byOldUrl.get(old) ?? (parts.length === 3 && parts[2] in files ? parts[2] : undefined);
    if (slug) {
      const cat = productCat[slug];
      redirects.redirects[old] = visible(slug) ? `/catalog/${cat}/${slug}/` : used.has(cat) ? `/catalog/${cat}/` : '/catalog/';
    } else if (parts.length === 2 && parts[0] === 'catalog' && !used.has(parts[1])) {
      redirects.redirects[old] = '/catalog/';
    }
  }

  const out: FileChange[] = [];
  const add = (path: string, content: string, before?: string) => {
    if (content !== before) out.push({ path, content, encoding: 'utf-8' });
  };
  for (const [s, t] of Object.entries(files)) add(`src/content/products/${s}.md`, t, state.products[s]);
  for (const [s, t] of Object.entries(categories)) add(`src/content/categories/${s}.md`, t, state.categories[s]);
  const redirectsJson = JSON.stringify(redirects, null, 1);
  // .htaccess сайт собирает сам из redirects.json (src/pages/main.htaccess.ts)
  if (redirectsJson !== JSON.stringify(state.redirects, null, 1)) add('src/data/redirects.json', redirectsJson);
  return { files: out, stats };
}

const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')} ₽`;
const list = (items: string[], n = 6) => items.slice(0, n).join(', ') + (items.length > n ? ` и ещё ${items.length - n}` : '');

/** Сводка для владельца перед подтверждением. */
export function describePrice(stats: PriceStats, fileName: string, visibleBefore: number): string[] {
  const n = stats.total % 100, d = n % 10;
  const word = n > 10 && n < 20 ? 'позиций' : d === 1 ? 'позиция' : d > 1 && d < 5 ? 'позиции' : 'позиций';
  const lines = [`Прайс «${fileName}»: ${stats.total} ${word}.`];
  const p = stats.priceChanged;
  if (p.length) lines.push(`• Новая цена у ${p.length}: ${list(p.map((c) => `${c.sku} ${money(c.from)} → ${money(c.to)}`), 4)}`);
  if (stats.created.length) lines.push(`• Новые товары (${stats.created.length}): ${list(stats.created)}`);
  if (stats.unhidden.length) lines.push(`• Вернутся на сайт (${stats.unhidden.length}): ${list(stats.unhidden)}`);
  if (stats.backInStock.length) lines.push(`• Снова в наличии (${stats.backInStock.length}): ${list(stats.backInStock)}`);
  if (stats.ranOut.length) lines.push(`• Закончились (${stats.ranOut.length}): ${list(stats.ranOut)}`);
  if (stats.hidden.length) lines.push(`• Уберу с сайта ${stats.hidden.length}, их нет в прайсе: ${list(stats.hidden)}`);
  if (lines.length === 1) lines.push('Всё как на сайте, менять нечего.');
  else if (stats.hidden.length > visibleBefore / 2) {
    lines.push('', 'Похоже, это не весь прайс. Если так, нажмите «Не убирать старые»: обновлю только то, что есть в файле.');
  }
  return lines;
}
