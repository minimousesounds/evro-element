"""Парсер старого сайта evro-element.ru.

Собирает товары, категории, статические страницы и список старых URL.
Запуск: python scrape.py   (результат в ../data)
"""
import csv
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.evro-element.ru"
ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
DATA = ROOT.parent / "data"
IMG = DATA / "images"
PAGES = DATA / "pages"
DELAY = 0.6
PROBE_MAX_ID = 120  # проверяем view-N за пределами списка, вдруг есть скрытые

STATIC = ["tehinfo", "about", "contact", "uslovia", "konfidencialnost", "soglasie",
          "notification", "acknowledgements", "maps", "panel", "reg", "shop"]

for d in (RAW, DATA, IMG, PAGES):
    d.mkdir(parents=True, exist_ok=True)


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (catalog migration)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            status = r.status
            final = r.geturl()
    except urllib.error.HTTPError as e:
        # CMS отдаёт фото с кодом 404, поэтому тело читаем и при ошибке
        if binary:
            body = e.read()
            time.sleep(DELAY)
            if body[:3] == bytes([0xFF, 0xD8, 0xFF]) or body[1:4] == b"PNG" or body[:4] == b"GIF8":
                return 200, body, url
        return e.code, None, url
    except Exception as e:  # noqa: BLE001
        print("  ошибка", url, e)
        return 0, None, url
    time.sleep(DELAY)
    return status, (data if binary else data.decode("utf-8", errors="replace")), final


def cached(name, url):
    p = RAW / name
    if p.exists():
        return 200, p.read_text(encoding="utf-8"), url
    status, text, final = fetch(url)
    if status == 200 and text:
        p.write_text(text, encoding="utf-8")
    return status, text, final


def strip_tags(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>|</tr>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    lines = [re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in s.splitlines()]
    out = []
    for ln in lines:
        if ln or (out and out[-1]):
            out.append(ln)
    return "\n".join(out).strip()


def meta(h, name):
    m = re.search(r"<meta\s+name=['\"]%s['\"]\s+content=['\"](.*?)['\"]" % name, h, re.I | re.S)
    return html.unescape(m.group(1)).strip() if m else ""


def parse_product(h, pid):
    p = {"old_id": pid, "old_url": f"/shop/view-{pid}.html"}
    m = re.search(r'<script type="application/ld\+json">\s*(\{.*?"@type":\s*"Product".*?)</script>', h, re.S)
    ld = {}
    if m:
        block = m.group(1)
        for key in ("name", "image", "description", "category", "sku", "brand"):
            mm = re.search(r'"%s":\s*"(.*?)"' % key, block)
            if mm:
                ld[key] = html.unescape(mm.group(1)).strip()
        mm = re.search(r'"price":\s*"([\d.]+)"', block)
        if mm:
            ld["price"] = float(mm.group(1))
        mm = re.search(r'"availability":\s*"https://schema.org/(\w+)"', block)
        if mm:
            ld["availability"] = mm.group(1)
    m = re.search(r'<div class="name_tovar">(.*?)</div>', h, re.S)
    p["name"] = strip_tags(m.group(1)) if m else ld.get("name", "")
    # характеристики только из блока товара
    har_block = ""
    m = re.search(r'id="tovar_har".*?<div id=e_cena', h, re.S)
    if m:
        har_block = m.group(0)
    attrs = {}
    for n, v in re.findall(r'name_har_tovar">(.*?)</span>.*?val_har_tovar"\s*>(.*?)</span>', har_block, re.S):
        attrs[strip_tags(n)] = strip_tags(v)
    p["sku"] = attrs.pop("Артикул", ld.get("sku", ""))
    p["brand"] = attrs.pop("Бренд", ld.get("brand", ""))
    p["attributes"] = attrs
    m = re.search(r'class="Cenanumber"[^>]*>([\d\s\xa0,]+)<', h)
    if m:
        p["price"] = float(m.group(1).replace("\xa0", "").replace(" ", "").replace(",", "."))
    else:
        p["price"] = ld.get("price")
    p["availability"] = ld.get("availability", "")
    p["category_name"] = ld.get("category", "")
    cats = re.findall(r'/shop/grup-(\d+)\.html', h[h.find("tovar_har") - 6000: h.find("tovar_har")] if "tovar_har" in h else "")
    p["category_old_id"] = None
    imgs = []
    for u in re.findall(r'src="(https://www\.evro-element\.ru/photo/im/[^"]+)"', h):
        if "/pre-" not in u and u not in imgs:
            imgs.append(u)
    p["image_urls"] = imgs
    m = re.search(r'<div class="opis_f[^"]*">(.*?)</div></div><!--str', h, re.S)
    p["description"] = strip_tags(m.group(1)) if m else ""
    m = re.search(r"<title>(.*?)</title>", h, re.S)
    p["old_title"] = html.unescape(m.group(1)).strip() if m else ""
    p["old_meta_description"] = meta(h, "description")
    return p


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    old_urls = []  # (url, type, status, note)

    # --- категории
    categories = []
    cat_products = {}
    for n in range(1, 11):
        status, h, _ = cached(f"grup-{n}.html", f"{BASE}/shop/grup-{n}.html")
        if status != 200 or not h:
            old_urls.append((f"/shop/grup-{n}.html", "category", status, ""))
            continue
        m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
        title = strip_tags(m.group(1)) if m else ""
        t = re.search(r"<title>(.*?)</title>", h, re.S)
        ids = sorted({int(x) for x in re.findall(r"/shop/view-(\d+)\.html", h)})
        pages = sorted(set(re.findall(r'href="([^"]*grup-%d[^"]*page[^"]*)"' % n, h)))
        if not title and t:
            title = re.sub(r"\s*Евроэлемент\s*$", "", html.unescape(t.group(1)).strip())
        categories.append({"old_id": n, "old_url": f"/shop/grup-{n}.html", "name": title,
                           "old_title": html.unescape(t.group(1)).strip() if t else "",
                           "old_meta_description": meta(h, "description"),
                           "product_old_ids": ids, "pagination_links": pages})
        cat_products[n] = ids
        old_urls.append((f"/shop/grup-{n}.html", "category", 200, title))
        print(f"категория {n}: {title!r}, товаров {len(ids)}, пагинация {len(pages)}")

    # --- список id товаров
    _, shop, _ = cached("shop.html", f"{BASE}/shop.html")
    ids = {int(x) for x in re.findall(r"/shop/view-(\d+)\.html", shop or "")}
    for v in cat_products.values():
        ids.update(v)
    listed = set(ids)
    ids.update(range(1, PROBE_MAX_ID + 1))

    products = []
    for pid in sorted(ids):
        status, h, final = cached(f"view-{pid}.html", f"{BASE}/shop/view-{pid}.html")
        if status != 200 or not h or 'id="tovar_har"' not in h:
            if pid in listed:
                old_urls.append((f"/shop/view-{pid}.html", "product", status, "в списке, но карточки нет"))
            continue
        p = parse_product(h, pid)
        p["listed"] = pid in listed
        for n, plist in cat_products.items():
            if pid in plist:
                p["category_old_id"] = n
                break
        products.append(p)
        old_urls.append((p["old_url"], "product", 200, f'{p["name"]} {p["sku"]}'))
        print(f'товар {pid}: {p["name"]} | {p["sku"]} | {p["brand"]} | {p["price"]} | фото {len(p["image_urls"])}' + ("" if p["listed"] else " | НЕ В СПИСКЕ"))

    # --- фото
    for p in products:
        local = []
        for u in p["image_urls"]:
            name = u.rsplit("/", 1)[-1].lower()
            dest = IMG / name
            if not dest.exists():
                status, data, _ = fetch(u, binary=True)
                if status == 200 and data and not data[:15].lstrip().lower().startswith(b"<!doctype") and b"<html" not in data[:200].lower():
                    dest.write_bytes(data)
                else:
                    print("  фото не скачалось", u, status)
                    continue
            local.append("images/" + name)
        p["images"] = local

    # --- статические страницы: обходим все внутренние ссылки
    queue = list(STATIC)
    seen = set()
    pages_index = []
    while queue:
        slug = queue.pop(0)
        if slug in seen:
            continue
        seen.add(slug)
        status, h, _ = cached(f"page-{slug}.html", f"{BASE}/{slug}.html")
        old_urls.append((f"/{slug}.html", "page", status, ""))
        if status != 200 or not h:
            continue
        for l in re.findall(r'href="(?:https://www\.evro-element\.ru)?/([\w-]+)\.html"', h):
            if l not in seen and l not in queue:
                queue.append(l)
        t = re.search(r"<title>(.*?)</title>", h, re.S)
        title = html.unescape(t.group(1)).strip() if t else slug
        a0 = h.find("infopage")
        a1 = h.find("endinfopage")
        body = h[h.find(">", a0) + 1:h.rfind("<", 0, a1)] if 0 <= a0 < a1 else ""
        text = strip_tags(body)
        links = sorted(set(re.findall(r'href="([^"#]+)"', body)))
        imgs = sorted(set(re.findall(r'<img[^>]+src="([^"]+)"', body, re.I)))
        (PAGES / f"{slug}.html").write_text(body.strip(), encoding="utf-8")
        md = f"# {title}\n\nСтарый адрес: /{slug}.html\nMeta description: {meta(h, 'description')}\nMeta robots: {meta(h, 'robots')}\n\n---\n\n{text}\n"
        if links:
            md += "\n\n## Ссылки в тексте\n" + "\n".join(f"- {l}" for l in links) + "\n"
        (PAGES / f"{slug}.md").write_text(md, encoding="utf-8")
        pages_index.append({"slug": slug, "old_url": f"/{slug}.html", "title": title, "chars": len(text),
                            "tables": len(re.findall(r"<table", body, re.I)), "images": imgs,
                            "robots": meta(h, "robots")})
        old_urls[-1] = (f"/{slug}.html", "page", status, title)
        print(f"страница {slug}: {title!r}, знаков {len(text)}, таблиц {pages_index[-1]['tables']}, картинок {len(imgs)}")
    (DATA / "pages.json").write_text(json.dumps(pages_index, ensure_ascii=False, indent=2), encoding="utf-8")
    _, home, _ = cached("home.html", f"{BASE}/")
    old_urls.append(("/", "home", 200, "главная, robots: " + meta(home or "", "robots")))

    # --- сохранение
    (DATA / "products.json").write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "categories.json").write_text(json.dumps(categories, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(DATA / "products.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["old_id", "sku", "name", "brand", "price", "category_old_id", "category_name", "availability", "images", "attributes", "description", "listed", "old_url"])
        for p in products:
            w.writerow([p["old_id"], p["sku"], p["name"], p["brand"], p["price"], p["category_old_id"], p["category_name"], p["availability"],
                        ", ".join(p["images"]), json.dumps(p["attributes"], ensure_ascii=False) if p["attributes"] else "", p["description"], p["listed"], p["old_url"]])
    with open(DATA / "old-urls.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["old_url", "type", "http_status", "note", "new_url"])
        for row in old_urls:
            w.writerow(list(row) + [""])
    print(f"\nИтого: товаров {len(products)}, категорий {len(categories)}, старых URL {len(old_urls)}")


if __name__ == "__main__":
    main()
