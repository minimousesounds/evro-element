"""Загружает прайс-лист (xls в формате «для Автопитера») в каталог сайта.

Запуск: python scripts/import_price.py "путь/к/прайсу.xls" [--dry]
Нужен пакет xlrd: pip install xlrd

- Товар из прайса, который уже есть на сайте (по артикулу), обновляется: цена, наличие,
  название, бренд, категория, единица, минимальная партия. Фото, характеристики и SEO остаются.
- Новые товары создаются.
- Товары сайта, которых нет в прайсе, скрываются (hidden: true), но не удаляются:
  вернуть можно в админке, сняв галочку «Скрыть с сайта».
- Категории без видимых товаров сайт не показывает сам.
- Редиректы со старого сайта пересчитываются под новые адреса.
"""
import json
import re
import sys
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "src" / "content" / "products"
CATEGORIES = ROOT / "src" / "content" / "categories"
DRY = "--dry" in sys.argv
sys.stdout.reconfigure(encoding="utf-8")

NEW_CATEGORIES = {
    "nasosy-vodyanye-kamaz": ("Насосы водяные КамАЗ и ремкомплекты", 11),
    "podshipniki": ("Подшипники", 12),
    "kronshtejny-i-korpusa-filtrov": ("Кронштейны и корпуса фильтров", 13),
}
# первое совпадение по названию задаёт категорию
RULES = [
    (r"элемент масляного", "element-maslyanogo-filtra"),
    (r"элемент топливного", "element-toplivnogo-filtra"),
    (r"кронштейн|корпус .*фильтра", "kronshtejny-i-korpusa-filtrov"),
    (r"фильтр масляный", "filtr-maslyanyj"),
    (r"фильтр топливный", "filtr-toplivnyj"),
    (r"фильтр воздушный", "filtr-vozdushnyj"),
    (r"фильтр гидравлический", "filtr-gidravlicheskij"),
    (r"помп|насос[а]? водян|р/к насоса|фибра|шкив насоса", "nasosy-vodyanye-kamaz"),
    (r"подшипник", "podshipniki"),
]
BRANDS = {"asas": "ASAS", "claas": "Claas", "new holland": "New Holland", "caterpillar": "Caterpillar",
          "komatsu": "Komatsu", "jcb landpower": "JCB", "камаз": "КамАЗ", "vspz": "VSPZ",
          "hifi filter": "HiFi Filter", "mann+hummel": "Mann+Hummel", "donaldson": "Donaldson", "racor": "Racor",
          "белзан": "БелЗАН", "уралаз": "УралАЗ"}
COUNTRIES = {"россия": "Россия", "китай": "Китай", "германия": "Германия"}
TYPOS = {"колпачек": "колпачок", "мотром": "мотором", "Самавра": "Самара"}
# кириллические буквы, которые выглядят как латинские, в артикулах
HOMOGLYPHS = str.maketrans("АВСЕНКМОРТХавсеокмртх", "ABCEHKMOPTXabceokmptx")


def slugify(s):
    s = s.translate(HOMOGLYPHS).lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "j", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                     "u", "f", "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def translit_slug(s):
    return slugify("".join(TRANSLIT.get(ch, ch) for ch in s.lower()))


def norm_sku(s):
    return re.sub(r"[^0-9a-z]", "", s.translate(HOMOGLYPHS).lower())


def q(s):
    return json.dumps(s, ensure_ascii=False)


def cell_text(c):
    if c.ctype == xlrd.XL_CELL_NUMBER:
        return str(int(c.value)) if float(c.value).is_integer() else str(c.value)
    return str(c.value).strip()


def read_price(path):
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    head = next(r for r in range(sh.nrows) if cell_text(sh.cell(r, 0)).lower() == "артикул")
    rows = []
    for r in range(head + 1, sh.nrows):
        # Excel иногда сохраняет числовой артикул текстом с хвостом «.0»
        sku = re.sub(r"^(\d+)\.0$", r"\1", cell_text(sh.cell(r, 0)))
        name = re.sub(r"\s+", " ", cell_text(sh.cell(r, 2)))
        if not sku or not name:
            continue
        rows.append({
            "sku": sku, "brand_raw": cell_text(sh.cell(r, 1)), "name": name,
            "unit": "компл." if cell_text(sh.cell(r, 3)).lower().startswith("к") else "шт.",
            "price": float(sh.cell(r, 4).value or 0), "qty": float(sh.cell(r, 5).value or 0),
            "min": max(1, int(float(sh.cell(r, 6).value or 1))),
        })
    return rows


def describe(row):
    """Название, бренд, исполнение, страна и категория из строки прайса."""
    name, raw = row["name"], row["brand_raw"].strip()
    for a, b in TYPOS.items():
        name = name.replace(a, b)
    low = name.lower()
    country = COUNTRIES.get(raw.lower(), "")
    brand = "" if country else BRANDS.get(raw.lower(), raw)
    m = re.search(r"\s*пр-во\s+(\S+)", name, re.I)
    if m:
        country = COUNTRIES.get(m.group(1).lower(), m.group(1))
        name = name[:m.start()] + name[m.end():]
    m = re.search(r"\s+(китай|германия|россия)$", name, re.I)
    if m:
        country = COUNTRIES[m.group(1).lower()]
        name = name[:m.start()]
    kind = ""
    if "оригинал" in low:
        kind = "original"
        name = re.sub(r"\s*\bоригинал\b.*$", "", name, flags=re.I)
    elif "аналог" in low or brand == "ASAS" or (brand == "Claas" and country):
        kind = "analog"
    name = re.sub(r"\s*\bаналог\b\s*", " ", name, flags=re.I).strip(" ,")
    name = re.sub(r"^(Рк|Р/к)\s", "Ремкомплект ", name)
    name = name[:1].upper() + name[1:]
    category = next((c for pat, c in RULES if re.search(pat, low)), "zapchasti")
    return {"title": name, "brand": brand, "kind": kind, "country": country, "category": category}


def set_field(text, key, value):
    """Меняет поле во frontmatter или добавляет его перед закрывающей чертой."""
    line = f"{key}: {value}"
    if re.search(rf"^{key}:.*$", text, re.M):
        return re.sub(rf"^{key}:.*$", lambda _: line, text, count=1, flags=re.M)
    head_end = text.index("\n---", 3)
    return text[:head_end] + "\n" + line + text[head_end:]


def get_field(text, key):
    m = re.search(rf"^{key}:\s*(.*)$", text, re.M)
    return m.group(1).strip().strip('"') if m else ""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    rows = read_price(args[0])
    files = {p.stem: p.read_text(encoding="utf-8") for p in PRODUCTS.glob("*.md")}
    # один артикул может встречаться несколько раз (разные производители): храним все файлы по порядку
    by_sku = {}
    for slug, text in sorted(files.items()):
        by_sku.setdefault(norm_sku(get_field(text, "sku")), []).append(slug)

    seen, created, updated = set(), [], []
    for row in rows:
        d = describe(row)
        fields = {
            "title": q(d["title"]), "brand": q(d["brand"]), "kind": q(d["kind"]), "category": d["category"],
            "price": f'{row["price"]:g}', "inStock": "true" if row["qty"] > 0 else "false",
            "unit": q(row["unit"]), "minQty": str(row["min"]), "country": q(d["country"]), "hidden": "false",
        }
        # на старом сайте часть артикулов записана с лишним нулём на конце (9846710 вместо 984671)
        candidates = by_sku.get(norm_sku(row["sku"])) or by_sku.get(norm_sku(row["sku"]) + "0") or []
        slug = next((s for s in candidates if s not in seen), None)
        if slug:
            text = files[slug]
            for k, v in {**fields, "sku": q(row["sku"])}.items():
                text = set_field(text, k, v)
            files[slug] = text
            updated.append(slug)
        else:
            base = slugify(row["sku"]) or "tovar"
            slug = base
            if slug in files:
                slug = f'{base}-{translit_slug(d["brand"] or d["country"]) or "2"}'
            n = 2
            while slug in files:
                slug, n = f"{base}-{n}", n + 1
            files[slug] = (
                "---\n" + "".join(f"{k}: {v}\n" for k, v in {
                    "title": fields["title"], "sku": q(row["sku"]), "brand": fields["brand"], "kind": fields["kind"],
                    "category": fields["category"], "price": fields["price"], "inStock": fields["inStock"],
                    "unit": fields["unit"], "minQty": fields["minQty"], "popular": "false", "offer": "false",
                    "images": "[]", "replaces": "[]", "specs": "[]", "country": fields["country"],
                    "applicability": '""', "seoTitle": '""', "seoDescription": '""', "hidden": "false",
                }.items()) + "---\n"
            )
            created.append(slug)
        seen.add(slug)

    hidden = [s for s in files if s not in seen]
    for s in hidden:
        files[s] = set_field(files[s], "hidden", "true")

    # новые категории создаём; пустые сайт сам не показывает
    cats = {p.stem: p.read_text(encoding="utf-8") for p in CATEGORIES.glob("*.md")}
    for slug, (title, order) in NEW_CATEGORIES.items():
        cats.setdefault(slug, f'---\ntitle: {q(title)}\norder: {order}\nimage: ""\nseoTitle: ""\nseoDescription: ""\n---\n')
    product_cat = {s: get_field(t, "category") for s, t in files.items()}
    used = {product_cat[s] for s in seen}

    # редиректы: старый адрес товара ведёт на новый адрес, скрытого — на его категорию
    rpath = ROOT / "src" / "data" / "redirects.json"
    data = json.loads(rpath.read_text(encoding="utf-8"))
    for old, new in data["redirects"].items():
        parts = new.strip("/").split("/")
        if len(parts) == 3 and parts[2] in files:
            slug = parts[2]
            cat = product_cat[slug]
            visible_cat = f"/catalog/{cat}/" if cat in used else "/catalog/"
            data["redirects"][old] = f"/catalog/{cat}/{slug}/" if slug in seen else visible_cat
        elif len(parts) == 2 and parts[0] == "catalog" and parts[1] not in used:
            data["redirects"][old] = "/catalog/"

    print(f"в прайсе {len(rows)}: обновлено {len(updated)}, создано {len(created)}; скрыто {len(hidden)}")
    print("пустые категории (не видны на сайте):", ", ".join(s for s in cats if s not in used) or "нет")
    if DRY:
        print("--dry: ничего не записано")
        return
    # без newline Windows записал бы CRLF и каждый файл выглядел бы изменённым целиком
    for s, t in files.items():
        (PRODUCTS / f"{s}.md").write_text(t, encoding="utf-8", newline="\n")
    for s, t in cats.items():
        (CATEGORIES / f"{s}.md").write_text(t, encoding="utf-8", newline="\n")
    rpath.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    ht = ["# Сгенерировано scripts/import_content.py и scripts/import_price.py. Редиректы со старого сайта.", "RewriteEngine On", ""]
    ht += [f"RewriteRule ^{re.escape(o.lstrip('/'))}$ {n} [R=301,L]" for o, n in sorted(data["redirects"].items())]
    ht += ["", "# Раздел обмена ссылками удалён", r"RewriteRule ^affiliation(-[\d-]+)?\.html$ - [G,L]", "", "ErrorDocument 404 /404.html", ""]
    (ROOT / "public" / ".htaccess").write_text("\n".join(ht), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
