// Отправка коротких форм (подбор фильтра, «Напишите нам») на сервис из настроек сайта.
document.querySelectorAll<HTMLFormElement>('form[data-lead]').forEach((form) => {
  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  const msg = form.querySelector<HTMLElement>('.lead__msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    let text = 'Спасибо! Перезвоним в рабочее время.';
    try {
      if (!form.dataset.endpoint) throw new Error('Отправка заявок ещё не настроена. Позвоните нам, пожалуйста.');
      const res = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ type: document.title, page: location.pathname, ...Object.fromEntries(new FormData(form)) }),
      });
      if (!res.ok) throw new Error('Не получилось отправить. Позвоните нам, пожалуйста.');
      form.reset();
    } catch (ex) {
      text = (ex as Error).message;
    }
    if (msg) {
      msg.textContent = text;
      msg.hidden = false;
    }
  });
});
