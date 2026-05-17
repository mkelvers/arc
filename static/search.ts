type CommandPaletteItem = {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
  image?: string;
  icon?: string;
};

const commandPaletteInitializedKey = Symbol('commandPaletteInitialized');
const globalWindow = window as Window & { [commandPaletteInitializedKey]?: boolean };

const paletteInput = document.getElementById('command-palette-input') as HTMLInputElement | null;
const paletteResults = document.querySelector(
  '[data-command-palette-results]'
) as HTMLElement | null;
const paletteDialog = document.querySelector('[data-command-palette-dialog]') as HTMLElement | null;
const paletteRoot = document.querySelector('[data-command-palette-root]') as HTMLElement | null;
const paletteOpenButtons = document.querySelectorAll('[data-command-palette-open]');
const paletteCloseButtons = document.querySelectorAll('[data-command-palette-close]');
const shortcutHints = document.querySelectorAll('[data-command-palette-shortcut]');

let paletteItems: CommandPaletteItem[] = [];
let selectedIndex = 0;
let fetchTimeout: number | undefined;
let lastQuery = '';
const responseCache = new Map<string, CommandPaletteItem[]>();

const iconPaths: Record<string, string> = {
  bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  compass:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
  play: 'M8 5v14l11-7z',
  search: 'M11 19a8 8 0 1 1 5.65-2.35L21 21 M16.65 16.65 21 21',
  trending: 'M3 17l6-6 4 4 8-8 M14 7h7v7',
};

const isMac = (): boolean => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const isSafeImageUrl = (rawUrl?: string): boolean => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const isOpen = (): boolean => paletteDialog?.classList.contains('flex') ?? false;

const setShortcutHints = (): void => {
  shortcutHints.forEach(hint => {
    hint.textContent = isMac() ? '⌘P' : 'Ctrl P';
  });
};

const clearResults = (): void => {
  paletteResults?.replaceChildren();
};

const buildIcon = (item: CommandPaletteItem): HTMLElement => {
  if (isSafeImageUrl(item.image)) {
    const img = document.createElement('img');
    img.className = 'h-11 w-8 shrink-0 bg-background-surface object-cover';
    img.src = item.image || '';
    img.alt = '';
    return img;
  }

  const icon = document.createElement('div');
  icon.className = 'flex h-8 w-8 shrink-0 items-center justify-center text-foreground-muted';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', item.icon === 'play' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('size-5');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPaths[item.icon || 'search'] || iconPaths.search);
  svg.appendChild(path);
  icon.appendChild(svg);

  return icon;
};

const selectItem = (index: number): void => {
  if (!paletteResults || paletteItems.length === 0) {
    selectedIndex = 0;
    return;
  }

  selectedIndex = Math.max(0, Math.min(index, paletteItems.length - 1));
  paletteResults.querySelectorAll<HTMLElement>('[data-command-palette-item]').forEach((row, i) => {
    const selected = i === selectedIndex;
    row.classList.toggle('bg-surface-hover', selected);
    row.setAttribute('aria-selected', String(selected));
    if (selected) {
      row.scrollIntoView({ block: 'nearest' });
    }
  });
};

const runSelectedItem = (): void => {
  const item = paletteItems[selectedIndex];
  if (!item) {
    return;
  }
  window.location.href = item.href;
};

const buildRow = (item: CommandPaletteItem, index: number): HTMLAnchorElement => {
  const row = document.createElement('a');
  row.href = item.href;
  row.className =
    'flex min-h-12 items-center gap-3 px-4 py-2 text-foreground no-underline transition-colors hover:bg-surface-hover hover:no-underline';
  row.dataset.commandPaletteItem = item.id;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(index === selectedIndex));

  row.addEventListener('mouseenter', () => selectItem(index));

  row.appendChild(buildIcon(item));

  const copy = document.createElement('div');
  copy.className = 'grid min-w-0 flex-1 gap-0.5';

  const label = document.createElement('div');
  label.className = 'truncate text-sm font-medium text-foreground';
  label.textContent = item.label;
  copy.appendChild(label);

  if (item.subtitle && item.type !== 'navigation') {
    const subtitle = document.createElement('div');
    subtitle.className = 'truncate text-xs text-foreground-muted';
    subtitle.textContent = item.subtitle;
    copy.appendChild(subtitle);
  }

  row.appendChild(copy);

  const hint = document.createElement('div');
  hint.className = 'hidden text-xs text-foreground-muted sm:block';
  hint.textContent = index === selectedIndex ? 'Enter' : '';
  row.appendChild(hint);

  return row;
};

const renderItems = (items: CommandPaletteItem[]): void => {
  if (!paletteResults) {
    return;
  }

  paletteItems = items;
  selectedIndex = 0;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-4 py-8 text-center text-sm text-foreground-muted';
    empty.textContent = 'No commands found';
    paletteResults.replaceChildren(empty);
    return;
  }

  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Command palette results');
  items.forEach((item, index) => {
    list.appendChild(buildRow(item, index));
  });
  paletteResults.replaceChildren(list);
  selectItem(0);
};

const fetchPaletteItems = (query: string): void => {
  lastQuery = query;

  const cached = responseCache.get(query);
  if (cached) {
    renderItems(cached);
    return;
  }

  fetch('/api/command-palette?q=' + encodeURIComponent(query))
    .then((res: Response) => {
      if (!res.ok) {
        return [];
      }
      return res.json();
    })
    .then((items: CommandPaletteItem[]) => {
      if (query !== lastQuery) {
        return;
      }
      responseCache.set(query, items);
      renderItems(items);
    })
    .catch((err: unknown) => {
      console.error('Command palette error:', err);
      renderItems([]);
    });
};

const scheduleFetch = (): void => {
  if (fetchTimeout) {
    window.clearTimeout(fetchTimeout);
  }

  const query = paletteInput?.value.trim() || '';
  fetchTimeout = window.setTimeout(() => fetchPaletteItems(query), query.length >= 2 ? 180 : 0);
};

const openPalette = (): void => {
  if (!paletteDialog || !paletteInput) {
    return;
  }

  paletteDialog.classList.remove('hidden');
  paletteDialog.classList.add('flex');
  paletteDialog.setAttribute('aria-hidden', 'false');
  paletteInput.value = '';
  paletteInput.focus();
  fetchPaletteItems('');
};

const closePalette = (): void => {
  if (!paletteDialog || !paletteInput) {
    return;
  }

  paletteDialog.classList.add('hidden');
  paletteDialog.classList.remove('flex');
  paletteDialog.setAttribute('aria-hidden', 'true');
  paletteInput.value = '';
  paletteItems = [];
  clearResults();
};

const onDocumentClick = (event: MouseEvent): void => {
  if (event.target === paletteDialog) {
    closePalette();
  }
};

const onInputKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectItem(selectedIndex + 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectItem(selectedIndex - 1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    runSelectedItem();
  }
};

const onDocumentKeydown = (event: KeyboardEvent): void => {
  const commandShortcut = event.key.toLowerCase() === 'p' && (event.metaKey || event.ctrlKey);

  if (commandShortcut && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (isOpen()) {
      closePalette();
    } else {
      openPalette();
    }
    return;
  }

  if (event.key === '/' && !isTypingTarget(event.target)) {
    event.preventDefault();
    openPalette();
    return;
  }

  if (event.key === 'Escape' && isOpen()) {
    event.preventDefault();
    closePalette();
  }
};

const initCommandPalette = (): void => {
  if (globalWindow[commandPaletteInitializedKey]) {
    return;
  }
  globalWindow[commandPaletteInitializedKey] = true;

  if (!paletteInput || !paletteResults || !paletteRoot) {
    return;
  }

  setShortcutHints();
  paletteOpenButtons.forEach(button => {
    button.addEventListener('click', openPalette);
  });
  paletteCloseButtons.forEach(button => {
    button.addEventListener('click', closePalette);
  });
  paletteInput.addEventListener('input', scheduleFetch);
  paletteInput.addEventListener('keydown', onInputKeydown);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
};

initCommandPalette();
