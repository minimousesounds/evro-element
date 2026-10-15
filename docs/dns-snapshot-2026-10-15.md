# DNS evro-element.ru на 15.10.2026

Снято до переезда, чтобы при смене хостинга не потерять почту и подтверждения.

| Запись | Значение |
|---|---|
| NS | ns1.beget.com, ns2.beget.com, ns1.beget.ru, ns2.beget.ru, ns1.beget.pro, ns2.beget.pro |
| A `@` | 45.130.41.83 (старый сайт студии на Beget) |
| A `www` | 45.130.41.83 |
| MX `@` | 10 mx.yandex.net |
| TXT `@` | `v=spf1 include:beget.com include:_spf.yandex.net ~all` |
| TXT `@` | `yandex-verification: 63190c1d60c56097` (подтверждение домена в Яндексе: почта или старый Вебмастер) |
| TXT `_dmarc` | `v=DMARC1; p=none; sp=none; aspf=r; fo=0;` |

DKIM с селектором `mail._domainkey` не найден.

При переезде MX, оба TXT на `@` и `_dmarc` переносятся без изменений, меняются только A-записи. Если меняются NS, все записи выше нужно завести в новой DNS-зоне до переключения.
