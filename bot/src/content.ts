// Правка файлов товаров (src/content/products/*.md). Только строки, без сети:
// так эти функции легко проверить тестами.

export interface NewProduct {
  sku: string;
  title: string;
  category: string;
  price: number;
  inStock: boolean;
  kind: '' | 'original' | 'analog';
  brand: string;
  images: string[];
}

const q = (s: string) => JSON.stringify(s);

/** Артикул в имя файла и адрес страницы: «HF5640+HF5639» → «hf5640-hf5639». */
export function slugify(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Свободное имя файла: если slug занят, добавляет -2, -3… */
export function uniqueSlug(sku: string, taken: Set<string>): string {
  const base = slugify(sku) || 'tovar';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

function splitFrontmatter(md: string): { fm: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('В файле товара нет блока --- в начале');
  return { fm: m[1], body: m[2] };
}

const join = (fm: string, body: string) => `---\n${fm}\n---\n${body}`;

/** Заменяет значение однострочного поля, а если его нет, дописывает в конец. */
function setLine(fm: string, key: string, value: string): string {
  const re = new RegExp(`^${key}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, `${key}: ${value}`) : `${fm}\n${key}: ${value}`;
}

export function setPrice(md: string, price: number): string {
  const { fm, body } = splitFrontmatter(md);
  return join(setLine(fm, 'price', String(price)), body);
}

export function setInStock(md: string, inStock: boolean): string {
  const { fm, body } = splitFrontmatter(md);
  return join(setLine(fm, 'inStock', String(inStock)), body);
}

export function setText(md: string, key: 'title' | 'brand' | 'kind', value: string): string {
  const { fm, body } = splitFrontmatter(md);
  return join(setLine(fm, key, q(value)), body);
}

export function setHidden(md: string, hidden: boolean): string {
  const { fm, body } = splitFrontmatter(md);
  return join(setLine(fm, 'hidden', String(hidden)), body);
}

/** Описание товара — текст после блока ---; пустой текст убирает описание. */
export function setBody(md: string, text: string): string {
  const { fm } = splitFrontmatter(md);
  return join(fm, text.trim() ? `\n${text.trim()}\n` : '');
}

export function setCategory(md: string, category: string): string {
  const { fm, body } = splitFrontmatter(md);
  return join(setLine(fm, 'category', category), body);
}

/** Добавляет фото первым в список images (главное фото товара). */
export function addImage(md: string, url: string): string {
  const { fm, body } = splitFrontmatter(md);
  const lines = fm.split('\n');
  const i = lines.findIndex((l) => /^images:/.test(l));
  if (i === -1) return join(`${fm}\nimages:\n  - ${q(url)}`, body);
  lines.splice(i, 1, 'images:', `  - ${q(url)}`);
  // если было «images: []», старых пунктов нет; иначе они идут следом и остаются
  return join(lines.join('\n'), body);
}

export function readField(md: string, key: string): string | undefined {
  const { fm } = splitFrontmatter(md);
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].trim();
  return v.startsWith('"') ? JSON.parse(v) : v;
}

/** Файл нового товара в том же виде, что делает импорт (scripts/import_content.py). */
export function newProductMd(p: NewProduct): string {
  const images = p.images.length ? `images:\n${p.images.map((i) => `  - ${q(i)}`).join('\n')}` : 'images: []';
  return [
    '---',
    `title: ${q(p.title)}`,
    `sku: ${q(p.sku)}`,
    `brand: ${q(p.brand)}`,
    `kind: ${q(p.kind)}`,
    `category: ${p.category}`,
    `price: ${p.price}`,
    `inStock: ${p.inStock}`,
    'popular: false',
    'offer: false',
    images,
    'replaces: []',
    'specs: []',
    'country: ""',
    'applicability: ""',
    'seoTitle: ""',
    'seoDescription: ""',
    '---',
    '',
  ].join('\n');
}
