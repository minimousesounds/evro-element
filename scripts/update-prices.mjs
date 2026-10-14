// Массовое обновление цен.
//
// Из файла:      node scripts/update-prices.mjs prices.csv
//                (CSV с колонками «артикул;цена», разделитель ; или запятая, первая строка может быть заголовком)
// На процент:    node scripts/update-prices.mjs --percent 10      (все цены +10%)
//                node scripts/update-prices.mjs --percent -5 --round 10   (−5%, округлить до 10 ₽)
// Проверка без записи: добавьте --dry
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'products');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const percent = flag('--percent');
const round = Number(flag('--round') || 1);
const file = args.find((a, i) => !a.startsWith('--') && !['--percent', '--round'].includes(args[i - 1]));

if (percent === undefined && !file) {
  console.log('Укажите файл с ценами или --percent N. Подробности в начале scripts/update-prices.mjs');
  process.exit(1);
}

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, '');
const prices = new Map();
if (file) {
  for (const line of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const [sku, price] = line.split(/[;,\t]/).map((s) => s?.trim().replace(/^"|"$/g, ''));
    const n = Number(String(price).replace(/\s/g, '').replace(',', '.'));
    if (sku && Number.isFinite(n) && n > 0) prices.set(norm(sku), n);
  }
}

let changed = 0;
const seen = new Set();
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const path = join(DIR, name);
  const text = readFileSync(path, 'utf8');
  const sku = text.match(/^sku:\s*"?([^"\n]+)"?\s*$/m)?.[1];
  const old = Number(text.match(/^price:\s*([\d.]+)\s*$/m)?.[1]);
  if (!sku || !Number.isFinite(old)) continue;
  let next;
  if (file) {
    if (!prices.has(norm(sku))) continue;
    seen.add(norm(sku));
    next = prices.get(norm(sku));
  } else {
    next = Math.round((old * (1 + Number(percent) / 100)) / round) * round;
  }
  if (next === old) continue;
  console.log(`${sku}: ${old} → ${next}`);
  changed++;
  if (!dry) writeFileSync(path, text.replace(/^price:\s*[\d.]+\s*$/m, `price: ${next}`));
}
for (const sku of prices.keys()) if (!seen.has(sku)) console.log(`нет на сайте: ${sku}`);
console.log(`${dry ? 'Изменилось бы' : 'Изменено'} цен: ${changed}`);
