type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const COOKIE_KEY = 'theme';

const getLocalStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readCookie = (key: string): string | null => {
  const entries = document.cookie.split(';').map(part => part.trim());
  for (const entry of entries) {
    if (!entry) continue;
    const eqIndex = entry.indexOf('=');
    if (eqIndex === -1) continue;
    const k = entry.slice(0, eqIndex).trim();
    if (k !== key) continue;
    return decodeURIComponent(entry.slice(eqIndex + 1));
  }
  return null;
};

const writeCookie = (key: string, value: string): void => {
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
};

const getPreferredTheme = (): Theme => {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
  return prefersDark ? 'dark' : 'light';
};

const normalizeTheme = (raw: string | null): Theme | null => {
  if (raw === 'light' || raw === 'dark') return raw;
  return null;
};

const getSavedTheme = (): Theme => {
  const storage = getLocalStorage();
  const fromStorage = normalizeTheme(storage?.getItem(STORAGE_KEY) ?? null);
  if (fromStorage) return fromStorage;

  const fromCookie = normalizeTheme(readCookie(COOKIE_KEY));
  if (fromCookie) return fromCookie;

  return getPreferredTheme();
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  const storage = getLocalStorage();
  try {
    storage?.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  writeCookie(COOKIE_KEY, theme);
};

const cycleTheme = (): void => {
  const current = getSavedTheme();
  const next: Theme = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
};

const initTheme = (): void => {
  const saved = getSavedTheme();
  applyTheme(saved);

  // delegated click handler on theme buttons
  document.addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('#theme-toggle, #footer-theme-toggle');
    if (!(btn instanceof HTMLButtonElement)) return;
    cycleTheme();
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}
