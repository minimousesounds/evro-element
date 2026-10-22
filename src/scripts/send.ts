// Отправка заказов и заявок на почту владельца через приёмник на своём хостинге (send.php, Beget, Россия):
// данные покупателей не уходят сторонним сервисам. Формы на сайте вызывают только sendForm().
import site from '../data/site.json';

const ENDPOINT = `${import.meta.env.BASE_URL}send.php`;

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Номер заказа, понятный человеку: КФ-151026-4821 (дата и случайные цифры). */
export function orderNumber(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `КФ-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * @param subject тема письма
 * @param fields поля в том порядке, в каком их удобно читать в письме
 * @param replyTo почта клиента, чтобы ответить ему прямо из письма
 */
export async function sendForm(subject: string, fields: Record<string, string>, replyTo?: string): Promise<SendResult> {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ subject, replyTo: replyTo || '', fields: { ...clean, 'Страница': location.href } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
    return { ok: true };
  } catch {
    return { ok: false, error: `Не получилось отправить. Позвоните нам, пожалуйста: ${site.phone}.` };
  }
}

/** Человекочитаемые поля короткой формы: имя полей в форме → подпись в письме. */
export function formFields(form: HTMLFormElement, labels: Record<string, string>): Record<string, string> {
  const fd = new FormData(form);
  const out: Record<string, string> = {};
  for (const [name, label] of Object.entries(labels)) out[label] = String(fd.get(name) ?? '').trim();
  return out;
}

/** Ловушка для ботов: скрытое поле, которое человек не заполнит. */
export const isBot = (form: HTMLFormElement) => Boolean((form.elements.namedItem('website') as HTMLInputElement | null)?.value);
