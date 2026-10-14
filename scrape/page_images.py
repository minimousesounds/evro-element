"""Скачивает картинки из текстов техстраниц в data/page-images."""
import json, sys, time, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urljoin, quote, urlsplit
D = Path(__file__).resolve().parent.parent / "data"
OUT = D / "page-images"; OUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding="utf-8")
pages = json.load(open(D / "pages.json", encoding="utf-8"))
ok = bad = 0; seen = set()
for p in pages:
    if p["slug"].startswith("affiliation") or p["slug"] == "shop": continue
    for src in p["images"]:
        url = urljoin("https://www.evro-element.ru/", src)
        if url in seen: continue
        seen.add(url)
        name = urlsplit(url).path.strip("/").replace("/", "__").lower()
        dest = OUT / name
        if dest.exists(): ok += 1; continue
        sp = urlsplit(url); req = urllib.request.Request(sp.scheme + "://" + sp.netloc + quote(sp.path), headers={"User-Agent": "Mozilla/5.0"})
        try:
            body = urllib.request.urlopen(req, timeout=30).read()
        except urllib.error.HTTPError as e:
            body = e.read()
        except Exception as e:
            print("ошибка", url, e); bad += 1; continue
        time.sleep(0.4)
        if body[:3] == bytes([0xFF, 0xD8, 0xFF]) or body[1:4] == b"PNG" or body[:4] == b"GIF8":
            dest.write_bytes(body); ok += 1
        else:
            print("не картинка", url); bad += 1
print("скачано", ok, "не удалось", bad)
