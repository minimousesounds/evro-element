import { describe, expect, it } from 'vitest';
import { addImage, newProductMd, readField, setBody, setCategory, setInStock, setPrice, setText, slugify, uniqueSlug } from '../src/content';

const md = `---
title: "Фильтр топливный"
sku: "SP926M"
brand: "ASAS"
kind: ""
category: filtr-toplivnyj
price: 1300
inStock: true
popular: false
offer: false
images:
  - "/uploads/products/sp926m.jpg"
replaces: []
specs: []
---
`;

describe('правка товара', () => {
  it('меняет цену и наличие, не трогая остальное', () => {
    const out = setInStock(setPrice(md, 1400), false);
    expect(readField(out, 'price')).toBe('1400');
    expect(readField(out, 'inStock')).toBe('false');
    expect(readField(out, 'title')).toBe('Фильтр топливный');
    expect(out.split('\n').length).toBe(md.split('\n').length);
  });

  it('меняет текстовые поля с кавычками', () => {
    const out = setText(setText(md, 'kind', 'analog'), 'title', 'Фильтр "топливный" тонкой очистки');
    expect(readField(out, 'kind')).toBe('analog');
    expect(readField(out, 'title')).toBe('Фильтр "топливный" тонкой очистки');
  });

  it('меняет категорию', () => {
    expect(readField(setCategory(md, 'filtr-maslyanyj'), 'category')).toBe('filtr-maslyanyj');
  });

  it('ставит новое фото первым и сохраняет старые', () => {
    const out = addImage(md, '/uploads/products/new.jpg');
    expect(out).toContain('images:\n  - "/uploads/products/new.jpg"\n  - "/uploads/products/sp926m.jpg"\nreplaces');
  });

  it('добавляет фото к товару без фото', () => {
    const out = addImage(md.replace(/images:\n  - .*\n/, 'images: []\n'), '/uploads/products/x.jpg');
    expect(out).toContain('images:\n  - "/uploads/products/x.jpg"\nreplaces');
  });
});

describe('описание товара', () => {
  const md = '---\ntitle: "Фильтр"\nprice: 100\n---\n';
  it('записывает описание после блока --- и не трогает поля', () => {
    const out = setBody(md, '  Высота 160 мм.\n\nСтавится на КамАЗ.  ');
    expect(out).toBe('---\ntitle: "Фильтр"\nprice: 100\n---\n\nВысота 160 мм.\n\nСтавится на КамАЗ.\n');
    expect(readField(out, 'price')).toBe('100');
  });
  it('пустой текст убирает описание', () => {
    expect(setBody(setBody(md, 'Текст'), '')).toBe(md);
  });
});

describe('новый товар', () => {
  it('собирает файл, который читается обратно', () => {
    const out = newProductMd({ sku: 'SP1553M', title: 'Фильтр топливный', category: 'filtr-toplivnyj', price: 330, inStock: true, kind: 'analog', brand: 'ASAS', images: [] });
    expect(readField(out, 'sku')).toBe('SP1553M');
    expect(readField(out, 'price')).toBe('330');
    expect(readField(out, 'kind')).toBe('analog');
    expect(out).toContain('images: []');
  });

  it('делает адрес из артикула и не занимает чужой', () => {
    expect(slugify('HF5640+HF5639')).toBe('hf5640-hf5639');
    expect(uniqueSlug('SP926M', new Set(['sp926m', 'sp926m-2']))).toBe('sp926m-3');
  });
});
