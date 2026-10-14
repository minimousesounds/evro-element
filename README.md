# Евроэлемент: сайт evro-element.ru

Статический сайт на Astro. Товары, категории и тексты лежат файлами в `src/content`, правятся через админку Sveltia CMS по адресу `/admin/`.

## Временная копия

Каждое изменение в ветке `main` само собирается и выкладывается на GitHub Pages:
https://minimousesounds.github.io/evro-element/ (закрыта от поисковиков).

Админка: https://minimousesounds.github.io/evro-element/admin/ → «Войти с токеном доступа».
Токен создаётся на GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens,
доступ только к репозиторию `evro-element`, право Contents: Read and write.
Изменения из админки сразу коммитятся в репозиторий, и через пару минут копия обновляется.

## Команды

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Готовый сайт после сборки лежит в `dist/`.

## Где что лежит

- `src/content/products/` — товары, один файл на товар. Имя файла — артикул, из него получается адрес страницы.
- `src/content/categories/` — категории.
- `src/content/tech/` — техническая информация.
- `src/content/pages/` — «О компании», «Контакты» и юридические страницы.
- `src/data/site.json` — телефон, адрес, режим работы, адрес сервиса для заказов.
- `public/uploads/` — фото.
- `public/admin/config.yml` — настройка полей админки.
- `public/.htaccess` — 301-редиректы со старых адресов (для хостинга на Apache).
- `data/` и `scrape/` — данные и парсер старого сайта.

## Массовое обновление цен

Из таблицы (CSV с колонками «артикул;цена»):

```bash
node scripts/update-prices.mjs prices.csv
```

Все цены на 10% выше, с округлением до 10 ₽:

```bash
node scripts/update-prices.mjs --percent 10 --round 10
```

Добавьте `--dry`, чтобы только посмотреть, что изменится.

## Что ещё не настроено

- `orderEndpoint` в `src/data/site.json`: адрес сервиса, который пересылает заказ на почту. Пока он пустой, форма оформления показывает ошибку.
- `dadataToken` в `src/data/site.json`: API-ключ dadata.ru для подсказок города и адреса при оформлении. Без ключа подсказывается только город из списка `src/data/cities.json`, адрес вводится вручную.
- `public/og-default.png`: картинка для соцсетей, экспортировать из Figma (страница «Ассеты», кадр «OG / Default»).
- Хостинг и перенос домена.
