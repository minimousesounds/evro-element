// Telegram-бот для правки каталога «Кама-фильтр». Работает на Cloudflare Workers.
// Сообщение владельца → Claude разбирает → бот показывает план → «Подтвердить» → коммит в репозиторий сайта.
import Anthropic from '@anthropic-ai/sdk';
import { planToFiles, type PhotoFile } from './apply';
import { loadCatalog, type Catalog } from './catalog';
import { GitHub } from './github';
import { parseMessage, type Photo } from './parse';
import { applyPrice, describePrice, readPrice, type RepoState } from './price';
import { buildPlan, commitMessage, describe, type Plan } from './plan';
import { Telegram, type TgCallback, type TgMessage, type TgUpdate } from './telegram';

export interface Env {
  TELEGRAM_TOKEN: string;
  /** Секрет, который Telegram присылает в заголовке: так отсекаем чужие запросы. */
  TELEGRAM_SECRET: string;
  ANTHROPIC_API_KEY: string;
  /** Токен GitHub с правом Contents: Read and write только на репозиторий сайта. */
  GITHUB_TOKEN: string;
  /** id пользователей Telegram через запятую, которым можно менять каталог. */
  ALLOWED_USER_IDS: string;
  REPO: string;
  BRANCH: string;
  SITE_INDEX_URL: string;
  PENDING: KVNamespace;
}

interface Pending {
  plan?: Plan;
  photoFileId?: string;
  photoExt?: PhotoFile['ext'];
  /** прайс-лист: файл перечитываем при подтверждении, чтобы применить к свежему каталогу */
  price?: { fileId: string; name: string };
  chatId: number;
}

const HELP = `Пишите как обычно, я пойму и покажу, что поменяю. Ничего не изменится, пока вы не нажмёте «Подтвердить».

Примеры:
• SP926M теперь 1400
• SP677 кончился
• HF5615 привезли, цена 7800
• SP1553M — это аналог
• Фото с подписью «SP1553M топливный аналог 330» — добавлю товар с фото
• Описание SP926M: высота 160 мм, резьба M16x1,5, ставится на КамАЗ Евро-3 — поправлю ошибки и покажу текст
• Сколько стоит AS1503?
• Файл прайса (xls или xlsx) — обновлю цены и наличие по всему каталогу

Сайт обновляется через 1–2 минуты после подтверждения.`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Подключение к Telegram без знания токена: GET /setup?secret=<TELEGRAM_SECRET>
    if (url.pathname === '/setup') {
      if (url.searchParams.get('secret') !== env.TELEGRAM_SECRET) return new Response('forbidden', { status: 403 });
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${url.origin}/`, secret_token: env.TELEGRAM_SECRET, allowed_updates: ['message', 'callback_query'] }),
      });
      return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method !== 'POST') return new Response('ok');
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_SECRET) return new Response('forbidden', { status: 403 });
    const update = (await request.json()) as TgUpdate;
    // Telegram ждёт быстрый ответ, а разбор занимает несколько секунд: работаем в фоне
    ctx.waitUntil(handle(update, env).catch((e) => console.error('update failed', e)));
    return new Response('ok');
  },
};

async function handle(update: TgUpdate, env: Env) {
  const tg = new Telegram(env.TELEGRAM_TOKEN);
  const allowed = new Set(env.ALLOWED_USER_IDS.split(',').map((s) => Number(s.trim())));
  if (update.callback_query) return onButton(update.callback_query, env, tg, allowed);
  const msg = update.message;
  if (!msg) return;
  if (!msg.from || !allowed.has(msg.from.id)) {
    await tg.send(msg.chat.id, `Это служебный бот магазина «Кама-фильтр». Ваш id: ${msg.from?.id ?? 'неизвестен'}`);
    return;
  }
  try {
    await onMessage(msg, env, tg);
  } catch (e) {
    console.error(e);
    await tg.send(msg.chat.id, 'Что-то пошло не так, изменения не внесены. Попробуйте ещё раз чуть позже.');
  }
}

function photoOf(msg: TgMessage): { fileId: string } | undefined {
  if (msg.photo?.length) return { fileId: msg.photo[msg.photo.length - 1].file_id };
  if (msg.document?.mime_type?.startsWith('image/')) return { fileId: msg.document.file_id };
  return undefined;
}

function extOf(path: string): PhotoFile['ext'] {
  const e = path.split('.').pop()?.toLowerCase();
  return e === 'png' ? 'png' : e === 'webp' ? 'webp' : 'jpg';
}

async function onMessage(msg: TgMessage, env: Env, tg: Telegram) {
  const text = msg.text ?? msg.caption ?? '';
  if (/^\/(start|help)/.test(text)) return void (await tg.send(msg.chat.id, HELP));
  await tg.typing(msg.chat.id);
  if (msg.document && /\.xlsx?$/i.test(msg.document.file_name ?? '')) return onPrice(msg, env, tg);

  const catalog: Catalog = await loadCatalog(env.SITE_INDEX_URL);
  const photoRef = photoOf(msg);
  let photo: Photo | undefined;
  let ext: PhotoFile['ext'] | undefined;
  if (photoRef) {
    const file = await tg.download(photoRef.fileId);
    ext = extOf(file.path);
    photo = { base64: file.base64, mediaType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
  }

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const parsed = await parseMessage(anthropic, catalog, text, photo);
  const plan = buildPlan(parsed.actions, catalog, Boolean(photo));

  const lines = [...plan.info, ...plan.problems];
  if (parsed.question) lines.push(parsed.question);

  if (!plan.changes.length) {
    await tg.send(msg.chat.id, lines.join('\n') || 'Не нашёл, что поменять. Напишите артикул и что сделать, например: «SP926M теперь 1400».');
    return;
  }

  const id = crypto.randomUUID().slice(0, 8);
  const pending: Pending = { plan, chatId: msg.chat.id, photoFileId: photoRef?.fileId, photoExt: ext };
  await env.PENDING.put(id, JSON.stringify(pending), { expirationTtl: 60 * 60 * 24 });
  const text_ = ['Понял так:', ...describe(plan, catalog), ...(lines.length ? ['', ...lines] : [])].join('\n');
  await tg.send(msg.chat.id, text_, [[{ text: '✅ Подтвердить', data: `ok:${id}` }, { text: '✖️ Отмена', data: `no:${id}` }]]);
}

async function readRepo(gh: GitHub): Promise<RepoState> {
  const products = 'src/content/products', categories = 'src/content/categories', redirects = 'src/data/redirects.json';
  const r = await gh.readMany([products, categories], [redirects]);
  const bySlug = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([n]) => n.endsWith('.md')).map(([n, t]) => [n.slice(0, -3), t]));
  return { products: bySlug(r.dirs[products]), categories: bySlug(r.dirs[categories]), redirects: JSON.parse(r.files[redirects]) };
}

const visibleCount = (state: RepoState) => Object.values(state.products).filter((t) => !/^hidden:\s*true/m.test(t)).length;

async function onPrice(msg: TgMessage, env: Env, tg: Telegram) {
  const doc = msg.document!;
  const name = doc.file_name ?? 'прайс';
  const rows = readPrice(await tg.downloadBytes(doc.file_id));
  if (!rows.length) {
    await tg.send(msg.chat.id, 'Не нашёл в файле таблицу с колонкой «Артикул». Пришлите прайс в том же виде, что для Автопитера: Артикул, Бренд, Наименование, Ед. изм., Цена, В наличии, Минимальная партия.');
    return;
  }
  const state = await readRepo(new GitHub(env.GITHUB_TOKEN, env.REPO, env.BRANCH));
  const { files, stats } = applyPrice(rows, state, true);
  const lines = describePrice(stats, name, visibleCount(state));
  if (!files.length) return void (await tg.send(msg.chat.id, lines.join('\n')));
  const id = crypto.randomUUID().slice(0, 8);
  const pending: Pending = { price: { fileId: doc.file_id, name }, chatId: msg.chat.id };
  await env.PENDING.put(id, JSON.stringify(pending), { expirationTtl: 60 * 60 * 24 });
  const buttons = [[{ text: '✅ Подтвердить', data: `ok:${id}` }, { text: '✖️ Отмена', data: `no:${id}` }]];
  if (stats.hidden.length) buttons.splice(0, 0, [{ text: 'Не убирать старые', data: `keep:${id}` }]);
  await tg.send(msg.chat.id, lines.join('\n'), buttons);
}

/** Применяет подтверждённый прайс. Возвращает строки для копии остальным. */
async function commitPrice(pending: Pending, keepOld: boolean, env: Env, tg: Telegram): Promise<string[]> {
  const gh = new GitHub(env.GITHUB_TOKEN, env.REPO, env.BRANCH);
  const rows = readPrice(await tg.downloadBytes(pending.price!.fileId));
  const state = await readRepo(gh);
  const { files, stats } = applyPrice(rows, state, !keepOld);
  const lines = describePrice(stats, pending.price!.name, visibleCount(state)).filter((l) => !l.startsWith('Похоже') && l);
  if (files.length) {
    const parts = [stats.priceChanged.length && `${stats.priceChanged.length} цен`, stats.created.length && `${stats.created.length} новых`, stats.hidden.length && `${stats.hidden.length} скрыто`].filter(Boolean);
    await gh.commit(`Бот: прайс ${pending.price!.name}${parts.length ? `, ${parts.join(', ')}` : ''}`, files);
  }
  return lines;
}

async function onButton(cb: TgCallback, env: Env, tg: Telegram, allowed: Set<number>) {
  if (!allowed.has(cb.from.id) || !cb.data || !cb.message) return void (await tg.answer(cb.id));
  const [action, id] = cb.data.split(':');
  const raw = await env.PENDING.get(id);
  const chatId = cb.message.chat.id;
  const original = cb.message.text ?? '';
  if (!raw) {
    await tg.answer(cb.id, 'Это уже неактуально');
    return;
  }
  await env.PENDING.delete(id); // повторное нажатие ничего не сделает
  if (action === 'no') {
    await tg.answer(cb.id, 'Отменено');
    await tg.edit(chatId, cb.message.message_id, `${original}\n\n✖️ Отменено, ничего не менял.`);
    return;
  }
  await tg.answer(cb.id, 'Вношу…');
  const pending = JSON.parse(raw) as Pending;
  const who = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') || `id ${cb.from.id}`;
  if (pending.price) {
    try {
      const lines = await commitPrice(pending, action === 'keep', env, tg);
      await tg.edit(chatId, cb.message.message_id, `${original}\n\n✅ Готово${action === 'keep' ? ', старые товары не трогал' : ''}. На сайте будет через 1–2 минуты.`);
      for (const uid of allowed) if (uid !== cb.from.id) await tg.send(uid, `${who} загрузил прайс:\n${lines.join('\n')}`).catch((e) => console.error('copy failed', uid, e));
    } catch (e) {
      console.error(e);
      await tg.edit(chatId, cb.message.message_id, `${original}\n\n⚠️ Не получилось сохранить, сайт не изменился. Попробуйте ещё раз.`);
    }
    return;
  }
  try {
    const gh = new GitHub(env.GITHUB_TOKEN, env.REPO, env.BRANCH);
    let photo: PhotoFile | undefined;
    if (pending.photoFileId) photo = { base64: (await tg.download(pending.photoFileId)).base64, ext: pending.photoExt ?? 'jpg' };
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const files = await planToFiles(pending.plan!, (p) => gh.readText(p), photo, stamp);
    await gh.commit(commitMessage(pending.plan!), files);
    await tg.edit(chatId, cb.message.message_id, `${original}\n\n✅ Готово. На сайте будет через 1–2 минуты.`);
    // остальным допущенным присылаем копию, чтобы видели, что поменялось
    const copy = `${who} изменил каталог:\n${describe(pending.plan!, await loadCatalog(env.SITE_INDEX_URL)).join('\n')}`;
    for (const id of allowed) if (id !== cb.from.id) await tg.send(id, copy).catch((e) => console.error('copy failed', id, e));
  } catch (e) {
    console.error(e);
    await tg.edit(chatId, cb.message.message_id, `${original}\n\n⚠️ Не получилось сохранить, сайт не изменился. Попробуйте ещё раз.`);
  }
}
