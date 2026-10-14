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

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-add]');
  if (!btn) return;
  const qtyInput = btn.dataset.qtyFrom ? document.querySelector<HTMLInputElement>(btn.dataset.qtyFrom) : null;
  const qty = Math.max(1, Number(qtyInput?.value) || 1);
  addToCart(
    {
      id: btn.dataset.add!,
      sku: btn.dataset.sku || '',
      title: btn.dataset.title || '',
      price: Number(btn.dataset.price) || 0,
      url: btn.dataset.url || '',
      image: btn.dataset.image || '',
    },
    qty,
  );
  const name = document.createElement('span');
  name.textContent = `${btn.dataset.title} ${btn.dataset.sku}`;
  toast(`Добавлено в корзину: ${name.innerHTML} <a href="${import.meta.env.BASE_URL}cart/">Открыть</a>`);
});

updateCounter();
window.addEventListener('storage', updateCounter);
