// Разбор сообщения владельца: свободный текст (и фото) → список действий над каталогом.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Catalog } from './catalog';

export const ActionSchema = z.object({
  type: z
    .enum(['price', 'stock', 'create', 'photo', 'edit', 'info'])
    .describe('price: новая цена; stock: появился или закончился; create: новый товар; photo: фото к существующему товару; edit: поменять название, бренд, исполнение или категорию; info: просто спрашивает'),
  sku: z.string().describe('Артикул ровно как в каталоге; для нового товара как написал владелец, латиницей и цифрами'),
  price: z.number().nullable().describe('Цена в рублях за штуку, если названа'),
  in_stock: z.boolean().nullable().describe('true если есть в наличии, false если закончился'),
  title: z.string().nullable().describe('Название товара, например «Фильтр топливный»'),
  category: z.string().nullable().describe('id категории из списка'),
  kind: z.enum(['original', 'analog']).nullable().describe('Оригинал или аналог, если сказано'),
  brand: z.string().nullable().describe('Бренд; для аналога — бренд оригинала, который он заменяет'),
});
export type Action = z.infer<typeof ActionSchema>;

export const ParseSchema = z.object({
  actions: z.array(ActionSchema),
  question: z.string().nullable().describe('Короткий уточняющий вопрос, если что-то непонятно; иначе null'),
});
export type ParseResult = z.infer<typeof ParseSchema>;

export interface Photo {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

const MODEL = 'claude-opus-5-5';

function systemPrompt(catalog: Catalog): string {
  const cats = catalog.categories.map((c) => `${c.id} — ${c.title}`).join('\n');
  const items = catalog.products
    .map((p) => `${p.sku} | ${p.title} | ${p.price} ₽ | ${p.inStock ? 'в наличии' : 'нет'} | ${p.category}${p.kind ? ` | ${p.kind}` : ''}${p.brand ? ` | ${p.brand}` : ''}`)
    .join('\n');
  return `Ты помогаешь владельцу магазина автофильтров «Кама-фильтр» вести каталог на сайте. Он пишет коротко и по-простому, как в мессенджере, иногда с опечатками. Твоя задача — понять, что он хочет изменить, и вернуть список действий.

Правила:
- Артикулы сравнивай без учёта регистра, пробелов, дефисов и похожих букв (кириллическая С и латинская C, Р и P и т. п.). В ответе пиши артикул ровно как в каталоге.
- «Кончился», «нет», «убери из наличия» — stock с in_stock=false. «Привезли», «появился», «есть» — stock с in_stock=true.
- Новая цена без других слов — price. Если в одной фразе и цена, и наличие, верни два действия.
- Товара нет в каталоге, но есть название и цена — это create. Подбери category из списка по названию. Если не хватает цены или непонятна категория, всё равно верни create с тем, что есть, и задай вопрос в question.
- К сообщению приложено фото: если артикул есть в каталоге — photo; если нет — create. Артикул и название можно прочитать с маркировки на фото.
- Сейчас магазин продаёт в основном аналоги, но kind ставь только если владелец прямо сказал «аналог» или «оригинал».
- Если владелец просто спрашивает (цена, есть ли в наличии), верни info.
- Ничего не придумывай. Если сообщение не про каталог, верни пустой actions и вежливо спроси, что поменять.

Категории (id — название):
${cats}

Каталог (артикул | название | цена | наличие | категория | исполнение | бренд):
${items}`;
}

export async function parseMessage(client: Anthropic, catalog: Catalog, text: string, photo?: Photo): Promise<ParseResult> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 } });
  content.push({ type: 'text', text: text.trim() || '(без подписи)' });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // задача простая: низкое усилие даёт быстрый ответ
    output_config: { effort: 'low', format: zodOutputFormat(ParseSchema) },
    // каталог меняется редко, поэтому кэшируем его вместе с инструкцией
    system: [{ type: 'text', text: systemPrompt(catalog), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    return { actions: [], question: 'Не смог разобрать сообщение. Напишите, пожалуйста, артикул и что поменять.' };
  }
  if (!response.parsed_output) throw new Error(`Модель вернула ответ не по схеме (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
