import { describe as group, expect, it } from 'vitest';
import { applyPrice, describePrice, describeRow, parseRows, type RepoState } from '../src/price';

const HEAD = ['Артикул', 'Бренд', 'Наименование', 'Ед. изм.', 'Цена', 'В наличии', 'Минимальная партия'];
const rows = (...r: unknown[][]) => parseRows([['', '', 'Прайс-лист'], HEAD, ...r]);

const product = (sku: string, extra: string) =>
  `---\ntitle: "Фильтр"\nsku: "${sku}"\nbrand: "ASAS"\nkind: "analog"\ncategory: filtr-toplivnyj\nprice: 100\ninStock: true\n${extra}images: []\n---\n`;

const state = (): RepoState => ({
  products: {
    sp926m: product('SP926M', 'oldId: 29\nhidden: false\n'),
    sp1553m: product('SP1553M', 'oldId: 16\nhidden: true\n'),
    '9846710': product('9846710', 'oldId: 40\n'),
  },
  categories: { 'filtr-toplivnyj': '---\ntitle: "Фильтр топливный"\norder: 2\n---\n' },
  redirects: {
    redirects: {
      '/shop/view-29.html': '/catalog/filtr-toplivnyj/sp926m/',
      '/shop/view-16.html': '/catalog/filtr-toplivnyj/',
      '/shop/view-40.html': '/catalog/zapchasti/9846710/',
    },
    gone: [],
  },
});

group('строки прайса', () => {
  it('находит заголовок и убирает хвост «.0» у артикула', () => {
    const r = rows(['984671.0', 'Claas', 'нож измельчителя правый оригинал', 'шт', 3700, 6, 1], [1292810, 'Камаз', 'Рк помпы из 19-и', 'к-т', 1000, 500, 1]);
    expect(r.map((x) => [x.sku, x.unit])).toEqual([['984671', 'шт.'], ['1292810', 'компл.']]);
  });

  it('без колонки «Артикул» строк нет', () => {
    expect(parseRows([['Название', 'Цена'], ['Фильтр', 100]])).toEqual([]);
  });

  it('разбирает бренд, исполнение, страну и категорию', () => {
    const [orig, rus, kit, cn] = rows(
      ['87349575', 'new holland', 'фильтр масляный ОРИГИНАЛ NEW HOLLAND', 'шт', 1700, 20, 1],
      ['5646982', 'claas', 'фильтр воздушный пр-во Россия', 'шт', 970, 80, 1],
      ['6520-1307010', 'КамАЗ', 'Р/к насоса водяного КамАЗ', 'к-т', 280, 1000, 1],
      ['sp470m', 'asas', 'фильтр топливный  китай', 'шт', 270, 40, 1],
    ).map(describeRow);
    expect(orig).toEqual({ title: 'Фильтр масляный', brand: 'New Holland', kind: 'original', country: '', category: 'filtr-maslyanyj' });
    expect(rus).toMatchObject({ title: 'Фильтр воздушный', brand: 'Claas', kind: 'analog', country: 'Россия' });
    expect(kit).toMatchObject({ title: 'Ремкомплект насоса водяного КамАЗ', category: 'nasosy-vodyanye-kamaz', kind: '' });
    expect(cn).toMatchObject({ title: 'Фильтр топливный', kind: 'analog', country: 'Китай' });
  });
});

group('применение прайса', () => {
  const price = rows(
    ['SP926M', 'asas', 'фильтр топливный', 'шт', 1350, 0, 1],
    ['984671.0', 'Claas', 'нож измельчителя правый оригинал', 'шт', 3700, 6, 1],
    ['XX1', 'asas', 'фильтр масляный аналог', 'шт', 500, 3, 2],
  );

  it('обновляет, создаёт и скрывает отсутствующие', () => {
    const { files, stats } = applyPrice(price, state(), true);
    expect(stats.priceChanged).toEqual([{ sku: 'SP926M', from: 100, to: 1350 }, { sku: '984671', from: 100, to: 3700 }]);
    expect(stats.ranOut).toEqual(['SP926M']);
    expect(stats.created).toEqual(['XX1']);
    expect(stats.hidden).toEqual([]); // SP1553M и так скрыт
    const xx1 = files.find((f) => f.path === 'src/content/products/xx1.md')!.content;
    expect(xx1).toContain('minQty: 2\n');
    expect(xx1).toContain('category: filtr-maslyanyj\n');
    // артикул со старого сайта с лишним нулём обновился, а не задвоился
    expect(files.find((f) => f.path.endsWith('9846710.md'))!.content).toContain('sku: "984671"');
  });

  it('повторный прогон ничего не меняет', () => {
    const s = state();
    for (const f of applyPrice(price, s, true).files) {
      const m = f.path.match(/^src\/content\/products\/(.+)\.md$/);
      if (m) s.products[m[1]] = f.content;
      const c = f.path.match(/^src\/content\/categories\/(.+)\.md$/);
      if (c) s.categories[c[1]] = f.content;
      if (f.path === 'src/data/redirects.json') s.redirects = JSON.parse(f.content);
    }
    expect(applyPrice(price, s, true).files).toEqual([]);
  });

  it('«не убирать старые» не скрывает товары, которых нет в файле', () => {
    const s = state();
    s.products.sp1553m = s.products.sp1553m.replace('hidden: true', 'hidden: false');
    expect(applyPrice(price, s, true).stats.hidden).toEqual(['SP1553M']);
    expect(applyPrice(price, s, false).stats.hidden).toEqual([]);
  });

  it('вернувшийся товар получает обратно свой старый адрес', () => {
    const { files, stats } = applyPrice(rows(['SP1553M', 'asas', 'фильтр топливный', 'шт', 330, 5, 1]), state(), false);
    expect(stats.unhidden).toEqual(['SP1553M']);
    const red = JSON.parse(files.find((f) => f.path === 'src/data/redirects.json')!.content);
    expect(red.redirects['/shop/view-16.html']).toBe('/catalog/filtr-toplivnyj/sp1553m/');
  });

  it('один артикул у двух производителей даёт два товара', () => {
    const { stats, files } = applyPrice(
      rows(['7406-1307000-30', 'Камаз', 'Рк помпы', 'к-т', 1150, 100, 1], ['7406-1307000-30', 'Россия', 'Рк помпы (НАШ)', 'к-т', 1150, 100, 1]),
      state(),
      false,
    );
    expect(stats.created).toHaveLength(2);
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['src/content/products/7406-1307000-30.md', 'src/content/products/7406-1307000-30-rossiya.md']));
  });

  it('предупреждает, если прайс похож на неполный', () => {
    const lines = describePrice({ total: 3, priceChanged: [], ranOut: [], backInStock: [], created: [], unhidden: [], hidden: Array(50).fill('X') }, 'p.xls', 77);
    expect(lines[0]).toBe('Прайс «p.xls»: 3 позиции.');
    expect(lines.at(-1)).toContain('Не убирать старые');
  });
});
