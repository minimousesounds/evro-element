"""Переносит данные парсинга (data/) в контент сайта.

Создаёт src/content/{categories,products,tech,pages}, копирует фото в public/uploads,
заполняет new_url в data/old-urls.csv и пишет карту редиректов.

Запуск: python scripts/import_content.py
Существующие файлы товаров не перезаписываются, чтобы не затереть правки из админки.
Полный перезапуск: python scripts/import_content.py --force
"""
import csv
import json
import re
import shutil
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONTENT = ROOT / "src" / "content"
UPLOADS = ROOT / "public" / "uploads"
FORCE = "--force" in sys.argv
sys.stdout.reconfigure(encoding="utf-8")

CATEGORY_SLUGS = {
    1: "element-maslyanogo-filtra", 2: "element-toplivnogo-filtra", 3: "filtr-gidravlicheskij",
    4: "filtr-toplivnyj", 5: "filtr-vozdushnyj", 6: "filtr-maslyanyj", 7: "filtr-sapuna",
    8: "zapchasti", 9: "nasos-toplivnyj", 10: "filtr-centrifugi",
}
# порядок в меню: сначала самые ходовые
CATEGORY_ORDER = [6, 4, 5, 1, 2, 3, 7, 10, 9, 8]
PAGE_SLUGS = {"about": "about", "contact": "contacts", "konfidencialnost": "privacy",
              "uslovia": "terms", "soglasie": "consent", "notification": "cookies"}
SERVICE = {"panel", "reg", "getpass", "maps"}
NOT_BRANDS = {"Россия", "Китай", "не указан"}


def slugify(s):
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


class Cleaner(HTMLParser):
    """Оставляет только смысловую разметку, без классов и стилей старой CMS."""
    KEEP = {"p", "strong", "em", "b", "i", "br", "table", "tbody", "thead", "tr", "td", "th",
            "ul", "ol", "li", "h2", "h3", "h4", "a", "img", "sup", "sub"}
    VOID = {"br", "img"}
    BLOCK = {"p", "table", "tr", "ul", "ol", "li", "h2", "h3", "h4", "tbody", "thead"}

    def __init__(self, link_map, img_map):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.link_map = link_map
        self.img_map = img_map
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg", "form", "button", "iframe"):
            self.skip += 1
            return
        if self.skip or tag not in self.KEEP:
            return
        a = dict(attrs)
        extra = ""
        if tag == "a":
            href = self.link_map(a.get("href", ""))
            if not href:
                return
            extra = f' href="{href}"'
        elif tag == "img":
            src = self.img_map(a.get("src", ""))
            if not src:
                return
            extra = f' src="{src}" alt="" loading="lazy"'
        elif tag in ("td", "th"):
            for k in ("colspan", "rowspan"):
                if a.get(k) and a[k] != "1":
                    extra += f' {k}="{a[k]}"'
        tag = {"b": "strong", "i": "em"}.get(tag, tag)
        self.out.append(("\n" if tag in self.BLOCK else "") + f"<{tag}{extra}>")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "form", "button", "iframe"):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in self.KEEP or tag in self.VOID:
            return
        if tag == "a" and not any(x.startswith("<a ") for x in self.out[-40:]):
            return
        tag = {"b": "strong", "i": "em"}.get(tag, tag)
        self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if self.skip:
            return
        data = re.sub(r"\s+", " ", data.replace("\xa0", " "))
        if data.strip() or (data and self.out and not self.out[-1].endswith(">")):
            self.out.append(data.replace("<", "&lt;").replace(">", "&gt;"))

    def result(self):
        s = "".join(self.out)
        s = re.sub(r"<p>\s*(<br>)*\s*</p>", "", s)
        s = re.sub(r"<p>\s*(<table>)", r"\1", s)
        s = re.sub(r"<(strong|em)>\s*</\1>", "", s)
        s = re.sub(r"\n{2,}", "\n", s)
        return s.strip()


def main():
    products = json.load(open(DATA / "products.json", encoding="utf-8"))
    categories = json.load(open(DATA / "categories.json", encoding="utf-8"))
    pages = {p["slug"]: p for p in json.load(open(DATA / "pages.json", encoding="utf-8"))}
    new_url = {"/": "/"}

    # ---------- категории
    for c in categories:
        slug = CATEGORY_SLUGS[c["old_id"]]
        new_url[c["old_url"]] = f"/catalog/{slug}/"
        path = CONTENT / "categories" / f"{slug}.md"
        if path.exists() and not FORCE:
            continue
        write(path, "---\n"
              f"title: {yaml_str(c['name'])}\n"
              f"order: {CATEGORY_ORDER.index(c['old_id']) + 1}\n"
              f"oldId: {c['old_id']}\n"
              'image: ""\n'
              'seoTitle: ""\n'
              'seoDescription: ""\n'
              "---\n")

    # ---------- товары
    (UPLOADS / "products").mkdir(parents=True, exist_ok=True)
    used = set()
    created = 0
    for p in products:
        cat = CATEGORY_SLUGS[p["category_old_id"]]
        slug = slugify(p["sku"]) or f"tovar-{p['old_id']}"
        while slug in used:
            slug += "-2"
        used.add(slug)
        new_url[p["old_url"]] = f"/catalog/{cat}/{slug}/"
        images = []
        for im in p["images"]:
            name = Path(im).name
            shutil.copyfile(DATA / im, UPLOADS / "products" / name)
            images.append(f"/uploads/products/{name}")
        path = CONTENT / "products" / f"{slug}.md"
        if path.exists() and not FORCE:
            continue
        name = re.sub(r"\s+", " ", p["name"]).strip()
        low = name.lower()
        kind = "original" if "оригинал" in low else ("analog" if "аналог" in low else "")
        brand = p["brand"].strip()
        country = ""
        if brand in NOT_BRANDS:
            country = "" if brand == "не указан" else brand
            brand = ""
        if brand.lower() == "claas":
            brand = "Claas"
        fm = ["---",
              f"title: {yaml_str(name)}",
              f"sku: {yaml_str(p['sku'])}",
              f"brand: {yaml_str(brand)}",
              f"kind: {yaml_str(kind)}",
              f"category: {cat}",
              f"price: {int(p['price']) if float(p['price']).is_integer() else p['price']}",
              "inStock: true",
              "popular: false",
              "offer: false",
              "images:" + ("" if images else " []")]
        fm += [f"  - {yaml_str(i)}" for i in images]
        fm += ["replaces: []", "specs: []", f"country: {yaml_str(country)}", 'applicability: ""',
               'seoTitle: ""', 'seoDescription: ""', f"oldId: {p['old_id']}", "---", ""]
        write(path, "\n".join(fm))
        created += 1
    print(f"товары: всего {len(products)}, создано файлов {created}")

    # ---------- страницы и техинформация
    (UPLOADS / "tech").mkdir(parents=True, exist_ok=True)
    tech_slugs = [s for s in pages if not s.startswith("affiliation") and s not in SERVICE
                  and s not in PAGE_SLUGS and s not in ("tehinfo", "shop")]
    for s in tech_slugs:
        new_url[f"/{s}.html"] = f"/tech/{s}/"
    for s, n in PAGE_SLUGS.items():
        new_url[f"/{s}.html"] = f"/{n}/"
    new_url["/tehinfo.html"] = "/tech/"
    new_url["/shop.html"] = "/catalog/"
    for s in SERVICE:
        new_url[f"/{s}.html"] = "/"

    def link_map(href):
        href = href.strip()
        m = re.match(r"(?:https?://(?:www\.)?evro-element\.ru)?(/[^?#]*)", href)
        if m:
            path = m.group(1)
            if path in new_url:
                return new_url[path]
            if path.startswith("/affiliation"):
                return ""
            return ""
        return href if href.startswith("http") else ""

    def img_map(src):
        m = re.match(r"(?:https?://(?:www\.)?evro-element\.ru)?/([^?#]+)", src.strip())
        if not m:
            return ""
        name = m.group(1).replace("/", "__").lower()
        f = DATA / "page-images" / name
        if not f.exists():
            return ""
        short = name.split("__")[-1]
        shutil.copyfile(f, UPLOADS / "tech" / short)
        return f"/uploads/tech/{short}"

    def clean(slug):
        raw = (DATA / "pages" / f"{slug}.html").read_text(encoding="utf-8")
        i = raw.find('class="contentText"')
        if i >= 0:
            raw = raw[raw.find(">", i) + 1:]
        j = raw.find('<div id="response_detail"')
        if j >= 0:
            raw = raw[:j]
        c = Cleaner(link_map, img_map)
        c.feed(raw)
        return c.result()

    # родитель техстраницы: с какой страницы на неё ведёт ссылка
    top = re.findall(r"evro-element\.ru/([\w-]+)\.html", (DATA / "pages" / "tehinfo.html").read_text(encoding="utf-8"))
    parent = {}
    for s in tech_slugs:
        for child in re.findall(r"evro-element\.ru/([\w-]+)\.html", (DATA / "pages" / f"{s}.html").read_text(encoding="utf-8").split('id="response_detail"')[0]):
            if child in tech_slugs and child != s and child not in top and child not in parent:
                parent[child] = s
    n = 0
    for s in tech_slugs:
        path = CONTENT / "tech" / f"{s}.md"
        if path.exists() and not FORCE:
            continue
        title = re.sub(r"\s+", " ", pages[s]["title"]).strip()
        order = top.index(s) + 1 if s in top else 0
        write(path, "---\n"
              f"title: {yaml_str(title)}\n"
              f"parent: {yaml_str(parent.get(s, ''))}\n"
              f"order: {order}\n"
              'seoDescription: ""\n'
              "---\n\n" + clean(s) + "\n")
        n += 1
    print(f"техстраницы: {len(tech_slugs)}, создано {n}, верхнего уровня {sum(1 for s in tech_slugs if s in top)}")

    titles = {"about": "О компании", "contact": "Контакты", "konfidencialnost": "Политика конфиденциальности",
              "uslovia": "Условия использования сайта", "soglasie": "Согласие на обработку персональных данных",
              "notification": "Уведомление об использовании файлов куки"}
    for s, new in PAGE_SLUGS.items():
        path = CONTENT / "pages" / f"{new}.md"
        if path.exists() and not FORCE:
            continue
        write(path, "---\n" f"title: {yaml_str(titles[s])}\n" 'seoDescription: ""\n' "---\n\n" + clean(s) + "\n")

    # ---------- старые адреса и редиректы
    rows = list(csv.reader(open(DATA / "old-urls.csv", encoding="utf-8-sig"), delimiter=";"))
    head, rows = rows[0], rows[1:]
    redirects, gone = {}, []
    for r in rows:
        url = r[0]
        if "410" in r[4]:
            gone.append(url)
            r[5] = ""
        elif url in new_url and url != "/":
            r[5] = new_url[url]
            redirects[url] = new_url[url]
    with open(DATA / "old-urls.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(head)
        w.writerows(rows)
    write(ROOT / "src" / "data" / "redirects.json", json.dumps({"redirects": redirects, "gone": gone}, ensure_ascii=False, indent=1))
    ht = ["# Сгенерировано scripts/import_content.py. Редиректы со старого сайта.", "RewriteEngine On", ""]
    ht += [f"RewriteRule ^{re.escape(o.lstrip('/'))}$ {n} [R=301,L]" for o, n in sorted(redirects.items())]
    ht += ["", "# Раздел обмена ссылками удалён", r"RewriteRule ^affiliation(-[\d-]+)?\.html$ - [G,L]", "", "ErrorDocument 404 /404.html", ""]
    write(ROOT / "public" / ".htaccess", "\n".join(ht))
    print(f"редиректов {len(redirects)}, удалённых адресов {len(gone)}")


if __name__ == "__main__":
    main()
