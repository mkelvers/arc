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

let allPaletteItems: CommandPaletteItem[] = [];
let paletteItems: CommandPaletteItem[] = [];
let selectedIndex = 0;
let fetchTimeout: number | undefined;
let lastQuery = '';
let continueExpanded = false;
let activeRequestController: AbortController | undefined;
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

const buildSearchActionItem = (query: string): CommandPaletteItem => ({
  id: 'search:' + query.toLowerCase(),
  type: 'search',
  label: `Search anime for "${query}"`,
  subtitle: 'Browse',
  href: '/browse?q=' + encodeURIComponent(query),
  icon: 'search',
});

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

const buildSvgIcon = (pathData: string, className: string): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(...className.split(' '));

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  return svg;
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

const removeContinueWatchingItem = (item: CommandPaletteItem): void => {
  const animeID = item.id.replace('continue:', '');
  if (!animeID || animeID === item.id) {
    return;
  }

  fetch('/api/continue-watching/' + encodeURIComponent(animeID), { method: 'DELETE' })
    .then((res: Response) => {
      if (!res.ok) {
        return;
      }

      allPaletteItems = allPaletteItems.filter(candidate => candidate.id !== item.id);
      paletteItems = paletteItems.filter(candidate => candidate.id !== item.id);
      responseCache.clear();
      removeContinueWatchingCard(animeID);
      renderItems(allPaletteItems);
    })
    .catch((err: unknown) => {
      console.error('Continue watching remove error:', err);
    });
};

const removeContinueWatchingCard = (animeID: string): void => {
  document.getElementById('continue-watching-' + animeID)?.remove();

  const section = document.getElementById('continue-watching-section');
  if (!section) {
    return;
  }

  if (section.querySelectorAll('.continue-watching-item').length === 0) {
    section.remove();
  }
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

  if (item.type === 'continue') {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className =
      'flex h-8 w-8 shrink-0 items-center justify-center text-red-500/70 transition-colors hover:text-red-500';
    removeButton.setAttribute('aria-label', 'Remove from Continue Watching');
    removeButton.appendChild(buildSvgIcon('M18 6 6 18 M6 6l12 12', 'size-4'));
    removeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      removeContinueWatchingItem(item);
    });
    row.appendChild(removeButton);
  } else {
    const hint = document.createElement('div');
    hint.className = 'hidden text-xs text-foreground-muted sm:block';
    hint.textContent = index === selectedIndex ? 'Enter' : '';
    row.appendChild(hint);
  }

  return row;
};

const buildContinueToggle = (hiddenCount: number): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'flex w-full items-center gap-3 px-4 py-2 text-left text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground';

  const spacer = document.createElement('span');
  spacer.className = 'h-8 w-8 shrink-0';
  button.appendChild(spacer);

  const label = document.createElement('span');
  label.className = 'flex-1';
  label.textContent = continueExpanded
    ? 'Hide extra continue watching'
    : `Show ${hiddenCount} more continue watching`;
  button.appendChild(label);

  const chevron = buildSvgIcon(continueExpanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6', 'size-4');
  button.appendChild(chevron);

  button.addEventListener('click', () => {
    continueExpanded = !continueExpanded;
    renderItems(allPaletteItems);
  });

  return button;
};

const visiblePaletteItems = (items: CommandPaletteItem[]): CommandPaletteItem[] => {
  if (lastQuery !== '') {
    return items;
  }

  const continueItems = items.filter(item => item.type === 'continue');
  if (continueItems.length <= 1 || continueExpanded) {
    return items;
  }

  let firstContinueShown = false;
  return items.filter(item => {
    if (item.type !== 'continue') {
      return true;
    }
    if (!firstContinueShown) {
      firstContinueShown = true;
      return true;
    }
    return false;
  });
};

const renderItems = (items: CommandPaletteItem[]): void => {
  if (!paletteResults) {
    return;
  }

  allPaletteItems = items;
  paletteItems = visiblePaletteItems(items);
  selectedIndex = 0;

  if (paletteItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'px-4 py-8 text-center text-sm text-foreground-muted';
    empty.textContent = 'No commands found';
    paletteResults.replaceChildren(empty);
    return;
  }

  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Command palette results');
  paletteItems.forEach((item, index) => {
    list.appendChild(buildRow(item, index));

    const continueCount = items.filter(candidate => candidate.type === 'continue').length;
    if (lastQuery === '' && continueCount > 1 && item.type === 'continue' && index === 0) {
      list.appendChild(buildContinueToggle(continueCount - 1));
    }
  });
  paletteResults.replaceChildren(list);
  selectItem(0);
};

const renderPendingQuery = (query: string): void => {
  if (!query) {
    return;
  }

  renderItems([buildSearchActionItem(query)]);
};

const fetchPaletteItems = (query: string): void => {
  lastQuery = query;

  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = undefined;
  }

  const cached = responseCache.get(query);
  if (cached) {
    renderItems(cached);
    return;
  }

  renderPendingQuery(query);

  const controller = new AbortController();
  activeRequestController = controller;

  fetch('/api/command-palette?q=' + encodeURIComponent(query), { signal: controller.signal })
    .then((res: Response) => {
      if (!res.ok) {
        return [];
      }
      return res.json();
    })
    .then((items: CommandPaletteItem[]) => {
      if (controller.signal.aborted || query !== lastQuery) {
        return;
      }
      activeRequestController = undefined;
      responseCache.set(query, items);
      renderItems(items);
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      activeRequestController = undefined;
      console.error('Command palette error:', err);
      renderItems([]);
    });
};

const scheduleFetch = (): void => {
  if (fetchTimeout) {
    window.clearTimeout(fetchTimeout);
  }

  const query = paletteInput?.value.trim() || '';
  fetchTimeout = window.setTimeout(() => fetchPaletteItems(query), query.length >= 2 ? 300 : 120);
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
  continueExpanded = false;
  fetchPaletteItems('');
};

const closePalette = (): void => {
  if (!paletteDialog || !paletteInput) {
    return;
  }

  paletteDialog.classList.add('hidden');
  paletteDialog.classList.remove('flex');
  paletteDialog.setAttribute('aria-hidden', 'true');
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = undefined;
  }
  paletteInput.value = '';
  allPaletteItems = [];
  paletteItems = [];
  continueExpanded = false;
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
