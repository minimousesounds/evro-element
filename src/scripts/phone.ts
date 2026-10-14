// Маска телефона: +7 (9XX) XXX-XX-XX. «+7» подставляется само, человек вводит с девятки.
const PREFIX = '+7 (';

function digitsOf(value: string): string {
  let d = value.replace(/\D/g, '');
  if (value.trimStart().startsWith('+7')) d = d.slice(1);
  else if (d.length >= 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
  else if (d[0] === '8' || d[0] === '7') d = d.slice(1); // привычка начинать с 8 или 7
  return d.slice(0, 10);
}

function format(d: string): string {
  let out = PREFIX + d.slice(0, 3);
  if (d.length >= 3) out += ') ' + d.slice(3, 6);
  if (d.length >= 6) out += '-' + d.slice(6, 8);
  if (d.length >= 8) out += '-' + d.slice(8, 10);
  return out;
}

function setup(input: HTMLInputElement) {
  let prev = '';
  input.setAttribute('inputmode', 'tel');
  input.setAttribute('maxlength', '18');
  input.placeholder = '+7 (___) ___-__-__';

  const apply = (d: string) => {
    prev = d;
    input.value = format(d);
    input.setCustomValidity(d.length === 10 || (d.length === 0 && !input.required) ? '' : 'Введите номер полностью: 10 цифр после +7');
  };

  input.addEventListener('focus', () => {
    if (!input.value) apply('');
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  });
  input.addEventListener('blur', () => {
    if (!prev) {
      input.value = '';
      input.setCustomValidity(input.required ? 'Введите номер телефона' : '');
    }
  });
  input.addEventListener('input', (e) => {
    let d = digitsOf(input.value);
    // стёрли скобку или дефис: убираем цифру перед ним, иначе курсор «залипает»
    if ((e as InputEvent).inputType === 'deleteContentBackward' && d === prev) d = d.slice(0, -1);
    apply(d);
  });
  if (input.value) apply(digitsOf(input.value));
  else if (input.required) input.setCustomValidity('Введите номер телефона');
}

document.querySelectorAll<HTMLInputElement>('input[type="tel"]').forEach(setup);
