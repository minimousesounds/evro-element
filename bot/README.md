# Telegram-бот для каталога

Владелец пишет боту как человеку («SP926M теперь 1400», «SP677 кончился», фото с подписью). Claude разбирает сообщение, бот показывает, что поменяет, и после кнопки «Подтвердить» коммитит изменения в репозиторий. Сайт пересобирается сам через 1–2 минуты.

Бот отвечает только тем, чьи id указаны в `ALLOWED_USER_IDS`. Остальным он сообщает их id, это удобно при настройке.

## Как устроено

- `src/index.ts` — приём сообщений от Telegram, кнопки, запуск коммита.
- `src/parse.ts` — запрос к Claude (`claude-opus-5-5`, structured outputs), инструкция для модели.
- `src/plan.ts` — проверка действий по каталогу, текст подтверждения, сообщение коммита.
- `src/content.ts` — правка файлов товаров.
- `src/apply.ts` — план в файлы для коммита.
- `src/github.ts` — один коммит со всеми файлами через GitHub API.
- Список товаров бот берёт из `/bot-index.json` на сайте.

## Проверка

```bash
npm test
```

Проба разбора на реальной модели без записи на сайт (нужен `ANTHROPIC_API_KEY`):

```bash
npx tsx scripts/try.ts "SP926M теперь 1400, SP677 кончился"
```

## Запуск (один раз)

1. Бот в Telegram: написать @BotFather → `/newbot` → сохранить токен.
2. Ключ Anthropic: console.anthropic.com → API Keys.
3. Токен GitHub: Settings → Developer settings → Fine-grained tokens, доступ только к `evro-element`, Contents: Read and write.
4. Аккаунт Cloudflare (бесплатный), затем в папке `bot`:

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create PENDING
```

   Полученный id вписать в `wrangler.toml` вместо `REPLACE_WITH_KV_ID`.

5. Секреты (каждая команда спросит значение):

```bash
npx wrangler secret put TELEGRAM_TOKEN
```

```bash
npx wrangler secret put TELEGRAM_SECRET
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put GITHUB_TOKEN
```

```bash
npx wrangler secret put ALLOWED_USER_IDS
```

   `TELEGRAM_SECRET` — любая длинная случайная строка. `ALLOWED_USER_IDS` — id через запятую (свой и отца).

6. Выкладка:

```bash
npx wrangler deploy
```

7. Сказать Telegram, куда слать сообщения (подставить токен, адрес воркера и секрет):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<адрес воркера>&secret_token=<TELEGRAM_SECRET>&allowed_updates=[\"message\",\"callback_query\"]"
```
