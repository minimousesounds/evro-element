import type { APIRoute } from 'astro';
import site from '../data/site.json';
import { analogNote, brandLabel, fullName, getCategories, getProducts, productUrl } from '../lib/catalog';

// Каталог в формате YML для Яндекса (Товары в поиске, Яндекс Бизнес). Собирается вместе с сайтом,
// поэтому цены и наличие всегда как на сайте. Адрес: https://kama-filtr.ru/yml.xml
const xml = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// id предложения в YML — только цифры и латиница до 20 знаков; берём устойчивое число из slug
function offerId(slug: string): string {
  let h = 0x811c9dc5;
  for (const ch of slug) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return String(h);
}

export const GET: APIRoute = async ({ site: siteUrl }) => {
  const base = (siteUrl?.href ?? 'https://kama-filtr.ru/').replace(/\/$/, '');
  const abs = (path: string) => base + path;
  const categories = await getCategories();
  const catId = new Map(categories.map((c, i) => [c.id, i + 1]));
  const products = (await getProducts()).filter((p) => p.data.price > 0);
  const now = new Date();
  const date = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

  const offers = products.map((p) => {
    const d = p.data;
    const label = brandLabel(p);
    const desc = [
      `${fullName(p)}${label ? `, ${label}` : ''}.`,
      d.kind === 'analog' ? `Аналог. ${analogNote(p)}` : '',
      `Самовывоз в Набережных Челнах или отправка транспортной компанией по России. Счёт для организаций с НДС или без.`,
    ].filter(Boolean).join(' ');
    return [
      `<offer id="${offerId(p.id)}" available="${d.inStock}">`,
      `<url>${xml(abs(productUrl(p)))}</url>`,
      `<price>${d.price}</price>`,
      `<currencyId>RUR</currencyId>`,
      `<categoryId>${catId.get(d.category.id)}</categoryId>`,
      ...d.images.slice(0, 5).map((i) => `<picture>${xml(abs(i))}</picture>`),
      `<name>${xml(fullName(p))}</name>`,
      d.kind !== 'analog' && d.brand ? `<vendor>${xml(d.brand)}</vendor>` : '',
      `<vendorCode>${xml(d.sku)}</vendorCode>`,
      `<description>${xml(desc)}</description>`,
      d.minQty > 1 ? `<sales_notes>${xml(`Минимальная партия ${d.minQty} ${d.unit}`)}</sales_notes>` : '',
      `<pickup>true</pickup>`,
      `<delivery>true</delivery>`,
      d.country ? `<country_of_origin>${xml(d.country)}</country_of_origin>` : '',
      `</offer>`,
    ].filter(Boolean).join('');
  });

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<yml_catalog date="${date}">`,
    '<shop>',
    `<name>${xml(site.name)}</name>`,
    `<company>${xml(site.legalName)}</company>`,
    `<url>${xml(base + '/')}</url>`,
    `<email>${xml(site.email)}</email>`,
    '<currencies><currency id="RUR" rate="1"/></currencies>',
    `<categories>${categories.map((c) => `<category id="${catId.get(c.id)}">${xml(c.data.title)}</category>`).join('')}</categories>`,
    `<offers>${offers.join('\n')}</offers>`,
    '</shop>',
    '</yml_catalog>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
