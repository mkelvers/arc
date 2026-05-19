const MENU_ROOT_ID = 'mal-root';
const MENU_WATCHLIST_ID = 'mal-watchlist';
const MENU_STATUS_PREFIX = 'mal-status:';
const STATUSES = [
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
];

async function getSettings() {
  const { authToken, apiBaseUrl } = await browser.storage.local.get(['authToken', 'apiBaseUrl']);
  return {
    authToken: authToken || '',
    apiBaseUrl: apiBaseUrl || 'https://mal.mkelvers.tech',
  };
}

async function apiFetch(path, init = {}) {
  const { authToken, apiBaseUrl } = await getSettings();
  const url = apiBaseUrl.replace(/\/+$/, '') + path;
  const headers = new Headers(init.headers || {});
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res;
}

async function ensureContextMenu() {
  const { authToken } = await getSettings();
  await browser.contextMenus.removeAll();
  if (!authToken) return;

  browser.contextMenus.create({
    id: MENU_ROOT_ID,
    title: 'MyAnimeList',
    contexts: ['selection'],
  });

  browser.contextMenus.create({
    id: MENU_WATCHLIST_ID,
    parentId: MENU_ROOT_ID,
    title: 'Add to Watchlist',
    contexts: ['selection'],
  });

  for (const s of STATUSES) {
    browser.contextMenus.create({
      id: MENU_STATUS_PREFIX + s.value,
      parentId: MENU_WATCHLIST_ID,
      title: s.label,
      contexts: ['selection'],
    });
  }
}

browser.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

browser.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.authToken) ensureContextMenu();
});

browser.contextMenus.onClicked.addListener(async info => {
  if (typeof info.menuItemId !== 'string') return;
  if (!info.menuItemId.startsWith(MENU_STATUS_PREFIX)) return;

  const status = info.menuItemId.slice(MENU_STATUS_PREFIX.length);
  const text = (info.selectionText || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!text) return;

  try {
    const searchRes = await apiFetch(`/api/search-quick?q=${encodeURIComponent(text)}`);
    const items = await searchRes.json();
    const top = items && items[0];
    if (!top || !top.id) {
      await browser.notifications?.create?.({
        type: 'basic',
        title: 'MyAnimeList',
        message: `No matches for: ${text}`,
      });
      return;
    }

    await apiFetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animeId: top.id, status }),
    });
  } catch {
    // Silent failure by default; can be extended with notifications later.
  }
});
