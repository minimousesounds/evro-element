// Корзина хранится в браузере покупателя (localStorage), сервера нет.
export interface CartItem {
  id: string;
  sku: string;
  title: string;
  price: number;
  url: string;
  image: string;
  qty: number;
}

const KEY = 'ee-cart';

export function readCart(): CartItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  updateCounter();
  document.dispatchEvent(new CustomEvent('cart:change'));
}

export function addToCart(item: Omit<CartItem, 'qty'>, qty = 1) {
  const items = readCart();
  const found = items.find((i) => i.id === item.id);
  if (found) found.qty += qty;
  else items.push({ ...item, qty });
  writeCart(items);
}

export const cartTotal = (items: CartItem[]) => items.reduce((s, i) => s + i.price * i.qty, 0);
export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.qty, 0);
export const money = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' ₽';

function updateCounter() {
  const n = cartCount(readCart());
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
}

let toastTimer: number | undefined;
function toast(html: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3000);
}

export const MAX_QTY = 9999;

/** Ставит количество товара в корзине; 0 убирает товар. */
export function setQty(id: string, qty: number) {
  const n = Math.min(MAX_QTY, Math.max(0, Math.floor(qty) || 0));
  const items = readCart();
  writeCart(n ? items.map((i) => (i.id === id ? { ...i, qty: n } : i)) : items.filter((i) => i.id !== id));
}

// Кнопка «В корзину» со степпером: [data-cart-ctl] на обёртке, внутри [data-ctl-add], [data-ctl-stepper], [data-ctl-go].
// В карточке после добавления кнопка превращается в степпер, связанный с корзиной.
// На странице товара (data-mode="page") степпер виден всегда: до добавления это просто выбор количества.
const ctls = () => document.querySelectorAll<HTMLElement>('[data-cart-ctl]');
const qtyIn = (id: string) => readCart().find((i) => i.id === id)?.qty ?? 0;

function sync(ctl: HTMLElement) {
  const qty = qtyIn(ctl.dataset.cartCtl!);
  const page = ctl.dataset.mode === 'page';
  const input = ctl.querySelector<HTMLInputElement>('input')!;
  const stepper = ctl.querySelector<HTMLElement>('[data-ctl-stepper]')!;
  ctl.querySelector<HTMLElement>('[data-ctl-add]')!.hidden = qty > 0;
  const go = ctl.querySelector<HTMLElement>('[data-ctl-go]');
  if (go) go.hidden = qty === 0;
  if (!page) stepper.hidden = qty === 0;
  if (qty > 0 && document.activeElement !== input) input.value = String(qty);
  stepper.toggleAttribute('data-one', !page && qty === 1);
}

function itemOf(ctl: HTMLElement): Omit<CartItem, 'qty'> {
  const d = ctl.dataset;
  return { id: d.cartCtl!, sku: d.sku || '', title: d.title || '', price: Number(d.price) || 0, url: d.url || '', image: d.image || '' };
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const ctl = target.closest<HTMLElement>('[data-cart-ctl]');
  if (!ctl) return;
  const id = ctl.dataset.cartCtl!;
  const input = ctl.querySelector<HTMLInputElement>('input')!;
  const step = target.closest<HTMLElement>('[data-ctl-step]');
  if (step) {
    const next = (Number(input.value) || 0) + Number(step.dataset.ctlStep);
    if (qtyIn(id)) setQty(id, ctl.dataset.mode === 'page' ? Math.max(1, next) : next);
    else input.value = String(Math.min(MAX_QTY, Math.max(1, next)));
    return;
  }
  if (!target.closest('[data-ctl-add]')) return;
  const qty = ctl.dataset.mode === 'page' ? Math.min(MAX_QTY, Math.max(1, Number(input.value) || 1)) : 1;
  addToCart(itemOf(ctl), qty);
  const name = document.createElement('span');
  name.textContent = `${ctl.dataset.title} ${ctl.dataset.sku}`;
  toast(`Добавлено в корзину: ${name.innerHTML} <a href="${import.meta.env.BASE_URL}cart/">Открыть</a>`);
});

// Количество можно просто вписать: сохраняем по уходу из поля или Enter
document.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const ctl = input.closest<HTMLElement>('[data-cart-ctl]');
  if (!ctl || input.tagName !== 'INPUT') return;
  const id = ctl.dataset.cartCtl!;
  const n = Math.min(MAX_QTY, Math.max(0, Math.floor(Number(input.value)) || 0));
  if (qtyIn(id)) setQty(id, ctl.dataset.mode === 'page' ? Math.max(1, n) : n);
  else input.value = String(Math.max(1, n));
  sync(ctl);
});
document.addEventListener('keydown', (e) => {
  const input = e.target as HTMLElement;
  if (e.key === 'Enter' && input.matches('[data-cart-ctl] input')) (input as HTMLInputElement).blur();
});
// Клик по числу выделяет его целиком, чтобы сразу вписать новое
document.addEventListener('focusin', (e) => {
  const input = e.target as HTMLElement;
  if (input.matches('[data-cart-ctl] input, .stepper input')) (input as HTMLInputElement).select();
});

const syncAll = () => ctls().forEach(sync);
document.addEventListener('cart:change', syncAll);
window.addEventListener('storage', syncAll);
window.addEventListener('pageshow', syncAll);
syncAll();

updateCounter();
window.addEventListener('storage', updateCounter);
