import { describe as group, expect, it } from 'vitest';
import { planToFiles } from '../src/apply';
import type { Catalog } from '../src/catalog';
import { normSku } from '../src/catalog';
import { readField } from '../src/content';
import type { Action } from '../src/parse';
import { buildPlan, commitMessage, describe } from '../src/plan';

const catalog: Catalog = {
  categories: [
    { id: 'filtr-toplivnyj', title: 'Фильтр топливный' },
    { id: 'filtr-maslyanyj', title: 'Фильтр масляный' },
  ],
  products: [
    { id: 'sp926m', path: 'src/content/products/sp926m.md', sku: 'SP926M', title: 'Фильтр топливный', price: 1300, inStock: true, category: 'filtr-toplivnyj', kind: '', brand: 'ASAS', images: 1 },
    { id: 'sp677', path: 'src/content/products/sp677.md', sku: 'SP677', title: 'Фильтр масляный', price: 220, inStock: true, category: 'filtr-maslyanyj', kind: '', brand: 'ASAS', images: 1 },
  ],
};

const a = (x: Partial<Action> & Pick<Action, 'type' | 'sku'>): Action => ({ price: null, in_stock: null, title: null, category: null, kind: null, brand: null, ...x });

const md = (sku: string, price: number) => `---\ntitle: "Фильтр"\nsku: "${sku}"\nbrand: "ASAS"\nkind: ""\ncategory: filtr-toplivnyj\nprice: ${price}\ninStock: true\nimages: []\n---\n`;

group('план изменений', () => {
  it('объединяет цену и наличие одного товара в одно изменение', () => {
    const plan = buildPlan([a({ type: 'price', sku: 'sp926m', price: 1400 }), a({ type: 'stock', sku: 'SP677', in_stock: false })], catalog, false);
    expect(plan.changes).toHaveLength(2);
    expect(describe(plan, catalog)).toEqual(['• SP926M Фильтр топливный: цена 1 300 ₽ → 1 400 ₽', '• SP677 Фильтр масляный: нет в наличии']);
    expect(commitMessage(plan)).toBe('Бот: SP926M цена 1400, SP677 нет в наличии');
  });

  it('находит артикул, набранный кириллицей и с пробелом', () => {
    expect(normSku('SР 926М')).toBe(normSku('SP926M'));
    const plan = buildPlan([a({ type: 'price', sku: 'SР 926М', price: 1500 })], catalog, false);
    expect(plan.changes[0]).toMatchObject({ kind: 'update', productId: 'sp926m', price: 1500 });
  });

  it('пропускает изменение, если цена и так такая', () => {
    const plan = buildPlan([a({ type: 'price', sku: 'SP926M', price: 1300 })], catalog, false);
    expect(plan.changes).toHaveLength(0);
  });

  it('сообщает о неизвестном артикуле и не придумывает товар', () => {
    const plan = buildPlan([a({ type: 'price', sku: 'XX1', price: 10 })], catalog, false);
    expect(plan.changes).toHaveLength(0);
    expect(plan.problems).toEqual(['Не нашёл на сайте артикул XX1.']);
  });

  it('не создаёт товар без цены и просит дописать', () => {
    const plan = buildPlan([a({ type: 'create', sku: 'SP1553M', title: 'Фильтр топливный', category: 'filtr-toplivnyj' })], catalog, true);
    expect(plan.changes).toHaveLength(0);
    expect(plan.problems[0]).toContain('цену');
  });

  it('создаёт товар с фото', () => {
    const plan = buildPlan([a({ type: 'create', sku: 'SP1553M', title: 'Фильтр топливный', category: 'filtr-toplivnyj', price: 330, kind: 'analog', brand: 'ASAS' })], catalog, true);
    expect(describe(plan, catalog)[0]).toBe('➕ Новый товар SP1553M Фильтр топливный, 330 ₽, «Фильтр топливный», аналог ASAS, в наличии, с фото');
  });

  it('возвращает скрытый товар на сайт при новой цене, но не при «кончился»', () => {
    const hidden: Catalog = { ...catalog, products: catalog.products.map((p) => (p.id === 'sp677' ? { ...p, hidden: true } : p)) };
    const plan = buildPlan([a({ type: 'price', sku: 'SP677', price: 250 })], hidden, false);
    expect(describe(plan, hidden)).toEqual(['• SP677 Фильтр масляный: цена 220 ₽ → 250 ₽, вернётся на сайт']);
    expect(buildPlan([a({ type: 'stock', sku: 'SP677', in_stock: false })], hidden, false).changes[0]).not.toHaveProperty('unhide');
  });

  it('отвечает на вопрос без изменений', () => {
    const plan = buildPlan([a({ type: 'info', sku: 'SP677' })], catalog, false);
    expect(plan.info).toEqual(['SP677 Фильтр масляный: 220 ₽, в наличии']);
    expect(plan.changes).toHaveLength(0);
  });
});

group('файлы для коммита', () => {
  it('правит свежую версию файла и кладёт фото рядом', async () => {
    const plan = buildPlan([a({ type: 'photo', sku: 'SP926M' }), a({ type: 'price', sku: 'SP926M', price: 1400 })], catalog, true);
    const files = await planToFiles(plan, async () => md('SP926M', 1300), { base64: 'AAAA', ext: 'jpg' }, '20261014');
    expect(files.map((f) => f.path)).toEqual(['public/uploads/products/sp926m-20261014.jpg', 'src/content/products/sp926m.md']);
    const product = files[1].content;
    expect(readField(product, 'price')).toBe('1400');
    expect(product).toContain('images:\n  - "/uploads/products/sp926m-20261014.jpg"');
  });

  it('создаёт файл нового товара', async () => {
    const plan = buildPlan([a({ type: 'create', sku: 'SP1553M', title: 'Фильтр топливный', category: 'filtr-toplivnyj', price: 330 })], catalog, false);
    const files = await planToFiles(plan, async () => { throw new Error('не должен читать'); }, undefined, '20261014');
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/content/products/sp1553m.md');
    expect(readField(files[0].content, 'price')).toBe('330');
  });
});
