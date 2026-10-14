// Минимальная обёртка над Telegram Bot API: только то, что нужно боту.

export interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}
export interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; first_name?: string; last_name?: string };
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
}
export interface TgCallback {
  id: string;
  from: { id: number; first_name?: string; last_name?: string };
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

export class Telegram {
  constructor(private token: string) {}

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
    return data.result;
  }

  send(chatId: number, text: string, buttons?: { text: string; data: string }[][]) {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
    });
  }

  edit(chatId: number, messageId: number, text: string) {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text });
  }

  answer(callbackId: string, text?: string) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) });
  }

  typing(chatId: number) {
    return this.call('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  /** Скачивает файл по file_id и возвращает base64. */
  async download(fileId: string): Promise<{ base64: string; path: string }> {
    const file = await this.call<{ file_path: string }>('getFile', { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Не скачалось фото: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), path: file.file_path };
  }
}
