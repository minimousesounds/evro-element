"""Размечает old-urls.csv: что делать с каждым старым адресом."""
import csv, json, sys
from pathlib import Path
D = Path(__file__).resolve().parent.parent / "data"
sys.stdout.reconfigure(encoding="utf-8")
pages = {p["slug"]: p for p in json.load(open(D / "pages.json", encoding="utf-8"))}
rows = list(csv.reader(open(D / "old-urls.csv", encoding="utf-8-sig"), delimiter=";"))
head, rows = rows[0], rows[1:]
SERVICE = {"panel", "reg", "getpass"}
LEGAL = {"uslovia", "konfidencialnost", "soglasie", "notification", "acknowledgements"}
MAIN = {"about", "contact", "tehinfo", "shop", "maps"}
out, stat = [], {}
for r in rows:
    url, typ, status, note = r[:4]
    slug = url.strip("/").replace(".html", "")
    if typ == "product": group, action = "товар", "301 на новую карточку"
    elif typ == "category": group, action = "категория", "301 на новую категорию"
    elif typ == "home": group, action = "главная", "остаётся"
    elif status != "200": group, action = "битая", "ничего"
    elif slug.startswith("affiliation"): group, action = "обмен ссылками", "не переносить, отдать 410"
    elif slug in SERVICE: group, action = "служебная", "301 на главную"
    elif slug in LEGAL: group, action = "юридическая", "301 на новую страницу"
    elif slug in MAIN: group, action = "основная", "301 на новую страницу"
    else: group, action = "техинформация", "перенести текст, 301 на новую страницу"
    stat[group] = stat.get(group, 0) + 1
    out.append([url, group, status, note, action, ""])
with open(D / "old-urls.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";"); w.writerow(["old_url", "group", "http_status", "title", "action", "new_url"]); w.writerows(out)
print(stat, len(out))
tech = [p for s, p in pages.items() if not s.startswith("affiliation") and s not in SERVICE | LEGAL | MAIN]
print("техстраниц", len(tech), "с таблицами", sum(1 for p in tech if p["tables"]), "знаков", sum(p["chars"] for p in tech), "картинок", sum(len(p["images"]) for p in tech))
