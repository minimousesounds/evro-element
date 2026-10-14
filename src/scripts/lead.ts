// Короткие формы (подбор фильтра, «Напишите нам»): письмо владельцу через sendForm.
import { sendForm, formFields, isBot } from './send';

document.querySelectorAll<HTMLFormElement>('form[data-lead]').forEach((form) => {
  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  const msg = form.querySelector<HTMLElement>('.lead__msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    if (isBot(form)) return;
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (btn) btn.disabled = true;
    const res = await sendForm(
      form.dataset.subject || 'Заявка с сайта',
      formFields(form, { name: 'Имя', phone: 'Телефон', comment: 'Артикул, техника или вопрос' }),
    );
    if (btn) btn.disabled = false;
    if (res.ok) form.reset();
    if (msg) {
      msg.textContent = res.ok ? 'Спасибо! Перезвоним в рабочее время.' : res.error!;
      msg.hidden = false;
    }
  });
});
