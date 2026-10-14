// Проба разбора без Telegram и без записи на сайт:
//   npx tsx scripts/try.ts "SP926M теперь 1400, SP677 кончился"
//   npx tsx scripts/try.ts "SP1553M топливный аналог ASAS 330" фото.jpg
// Нужна переменная окружения ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { loadCatalog } from '../src/catalog';
import { parseMessage, type Photo } from '../src/parse';
import { buildPlan, commitMessage, describe } from '../src/plan';

const INDEX = process.env.SITE_INDEX_URL ?? 'https://minimousesounds.github.io/evro-element/bot-index.json';
const [text = '', photoPath] = process.argv.slice(2);

const catalog = await loadCatalog(INDEX);
let photo: Photo | undefined;
if (photoPath) {
  const ext = photoPath.split('.').pop()?.toLowerCase();
  photo = { base64: readFileSync(photoPath).toString('base64'), mediaType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
}

const parsed = await parseMessage(new Anthropic(), catalog, text, photo);
console.log('Модель вернула:', JSON.stringify(parsed, null, 2));
const plan = buildPlan(parsed.actions, catalog, Boolean(photo));
console.log('\nБот ответит:');
console.log(['Понял так:', ...describe(plan, catalog), ...plan.info, ...plan.problems, ...(parsed.question ? [parsed.question] : [])].join('\n'));
if (plan.changes.length) console.log(`\nКоммит: ${commitMessage(plan)}`);
