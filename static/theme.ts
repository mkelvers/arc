type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

const getSavedTheme = (): Theme => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark') {
    return raw;
  }
  return 'dark';
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
};

const cycleTheme = (): void => {
  const current = getSavedTheme();
  const next: Theme = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
};

const initTheme = (): void => {
  const saved = getSavedTheme();
  applyTheme(saved);

  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const btn = target.closest('#theme-toggle, #footer-theme-toggle') as HTMLButtonElement | null;
    if (btn) {
      cycleTheme();
    }
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}
