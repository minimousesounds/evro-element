// Мелкие общие взаимодействия: степпер количества, копирование, вкладки.

// Степпер: кнопки с data-step="-1" и data-step="1" рядом с полем ввода
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step]');
  if (!btn) return;
  const input = btn.closest('.stepper')?.querySelector<HTMLInputElement>('input');
  if (!input) return;
  input.value = String(Math.max(Number(input.min) || 1, (Number(input.value) || 1) + Number(btn.dataset.step)));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

// Копирование текста: кнопка с data-copy="текст"
document.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy || '');
    const prev = btn.getAttribute('aria-label') || '';
    btn.setAttribute('aria-label', 'Скопировано');
    btn.classList.add('is-copied');
    setTimeout(() => {
      btn.setAttribute('aria-label', prev);
      btn.classList.remove('is-copied');
    }, 1500);
  } catch {
    /* буфер обмена недоступен, ничего страшного */
  }
});

// Вкладки: [role=tablist] с кнопками [role=tab][aria-controls]
document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((list) => {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls')!);
      if (panel) panel.hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
});
