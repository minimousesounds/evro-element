// Подсказки города и адреса в оформлении заказа.
// С ключом DaData (настройка dadataToken) подсказывает любые города и адреса России,
// адрес ищется внутри выбранного города. Без ключа город подсказывается из встроенного списка.
import cities from '../data/cities.json';

interface Suggestion {
  label: string;
  hint?: string;
  value: string;
  fias?: string;
}
type Source = (query: string) => Promise<Suggestion[]>;

const API = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

async function dadata(token: string, body: object): Promise<any[]> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  return (await res.json()).suggestions ?? [];
}

function attach(input: HTMLInputElement, source: Source, onPick?: (s: Suggestion) => void) {
  const wrap = input.parentElement!;
  wrap.classList.add('suggest');
  const list = document.createElement('ul');
  list.className = 'suggest__list';
  list.setAttribute('role', 'listbox');
  list.id = `${input.name}-suggest`;
  list.hidden = true;
  wrap.append(list);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let items: Suggestion[] = [];
  let active = -1;
  let timer: number | undefined;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
  };
  const pick = (s: Suggestion) => {
    input.value = s.value;
    close();
    onPick?.(s);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const render = () => {
    list.replaceChildren(
      ...items.map((s, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        li.textContent = s.label;
        if (s.hint) li.append(Object.assign(document.createElement('small'), { textContent: s.hint }));
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(s);
        });
        return li;
      }),
    );
    list.hidden = items.length === 0;
    input.setAttribute('aria-expanded', String(items.length > 0));
  };

  input.addEventListener('input', () => {
    delete input.dataset.fias;
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      items = [];
      render();
      return;
    }
    const my = ++seq;
    timer = window.setTimeout(async () => {
      const found = await source(q).catch(() => []);
      if (my !== seq) return; // пришёл ответ на устаревший запрос
      items = found;
      active = -1;
      render();
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => window.setTimeout(close, 100));
}

export function setupAddress(form: HTMLFormElement, token: string) {
  const city = form.querySelector<HTMLInputElement>('input[name="city"]');
  const address = form.querySelector<HTMLInputElement>('input[name="address"]');
  if (!city || !address) return;

  const localCities: Source = async (q) => {
    const n = q.toLowerCase().replace(/ё/g, 'е');
    const norm = (c: string) => c.toLowerCase().replace(/ё/g, 'е');
    const starts = (cities as string[]).filter((c) => norm(c).startsWith(n));
    const rest = (cities as string[]).filter((c) => !norm(c).startsWith(n) && norm(c).includes(n));
    return [...starts, ...rest].slice(0, 7).map((c) => ({ label: c, value: c }));
  };

  const remoteCities: Source = async (q) => {
    const found = await dadata(token, { query: q, count: 7, from_bound: { value: 'city' }, to_bound: { value: 'settlement' } });
    return found.map((s) => {
      const d = s.data;
      const name = d.settlement_with_type || d.city_with_type || s.value;
      const region = [d.area_with_type, d.region_with_type].filter((x: string) => x && x !== name).join(', ');
      return { label: name, hint: region, value: name.replace(/^(г|город)\s+/, ''), fias: d.settlement_fias_id || d.city_fias_id };
    });
  };

  attach(city, token ? remoteCities : localCities, (s) => {
    if (s.fias) city.dataset.fias = s.fias;
    address.value = '';
    address.focus();
  });

  if (!token) return;
  attach(address, async (q) => {
    if (!city.value.trim()) return [];
    // ищем только внутри города из соседнего поля
    const location = city.dataset.fias
      ? [{ city_fias_id: city.dataset.fias }, { settlement_fias_id: city.dataset.fias }]
      : [{ city: city.value.trim() }, { settlement: city.value.trim() }];
    const found = await dadata(token, { query: q, count: 7, locations: location, restrict_value: true, from_bound: { value: 'street' }, to_bound: { value: 'house' } });
    return found.map((s) => ({ label: s.value, value: s.value }));
  });
}
