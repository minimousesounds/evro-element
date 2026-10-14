// Отправка заказов и заявок на почту владельца.
// Сейчас через Web3Forms (ключ formsKey в src/data/site.json). Чтобы сменить сервис,
// достаточно поправить эту функцию: формы на сайте вызывают только sendForm().
import site from '../data/site.json';

const ENDPOINT = 'https://api.web3forms.com/submit';

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Номер заказа, понятный человеку: ЕЭ-141026-4821 (дата и случайные цифры). */
export function orderNumber(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `ЕЭ-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * @param subject тема письма
 * @param fields поля в том порядке, в каком их удобно читать в письме
 * @param replyTo почта клиента, чтобы ответить ему прямо из письма
 */
export async function sendForm(subject: string, fields: Record<string, string>, replyTo?: string): Promise<SendResult> {
  const key = (site as { formsKey?: string }).formsKey;
  if (!key) return { ok: false, error: `Отправка ещё не настроена. Позвоните нам: ${site.phone}.` };
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: key,
        subject,
        from_name: `Сайт ${site.name}`,
        ...(replyTo ? { replyto: replyTo } : {}),
        ...clean,
        'Страница': location.href,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || res.statusText);
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
