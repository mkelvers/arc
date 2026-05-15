type QuickSearchResult = {
  id?: number;
  image?: string;
  title?: string;
  type?: string;
};

// singleton flag to prevent double init (e.g. htmx swaps)
const searchInitializedKey = Symbol('searchInitialized');
const globalWindow = window as Window & { [searchInitializedKey]?: boolean };

let searchTimeout: number | undefined;
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const searchDropdown = document.querySelector(
  '[data-search-results-container]'
) as HTMLElement | null;
const searchDialog = document.querySelector('[data-search-dialog]') as HTMLElement | null;
const searchOpenButtons = document.querySelectorAll('[data-search-open]');
const searchCloseButtons = document.querySelectorAll('[data-search-close]');

const isSafeImageUrl = (rawUrl?: string): boolean => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    // block data: URIs and other potentially dangerous protocols
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const clearSearchResults = (): void => {
  if (!searchDropdown) {
    return;
  }

  searchDropdown.replaceChildren();
};

const openSearchDialog = (): void => {
  if (!searchDialog || !searchInput) {
    return;
  }

  searchDialog.classList.remove('hidden');
  searchDialog.classList.add('flex');
  searchDialog.setAttribute('aria-hidden', 'false');
  searchInput.focus();
};

const closeSearchDialog = (): void => {
  if (!searchDialog || !searchInput) {
    return;
  }

  searchDialog.classList.add('hidden');
  searchDialog.classList.remove('flex');
  searchDialog.setAttribute('aria-hidden', 'true');
  searchInput.value = '';
  clearSearchResults();
};

const buildSearchResultItem = (result: QuickSearchResult): HTMLAnchorElement => {
  const item = document.createElement('a');
  item.className =
    'flex items-start gap-3 px-3 py-2 text-foreground no-underline hover:bg-surface-hover hover:no-underline';
  item.setAttribute('href', '/anime/' + encodeURIComponent(String(result.id || '')));

  if (isSafeImageUrl(result.image)) {
    const img = document.createElement('img');
    img.className = 'aspect-2/3 w-[42px] shrink-0 object-cover bg-background-surface';
    img.setAttribute('src', result.image || '');
    img.setAttribute('alt', String(result.title || ''));
    item.appendChild(img);
  } else {
    const noImage = document.createElement('div');
    noImage.className =
      'aspect-2/3 w-[42px] shrink-0 bg-background-surface text-[0] text-transparent';
    noImage.textContent = 'no image';
    item.appendChild(noImage);
  }

  const info = document.createElement('div');
  info.className = 'grid min-w-0 gap-px';

  const itemTitle = document.createElement('div');
  itemTitle.className = 'line-clamp-1 text-[0.86rem] leading-[1.3] text-foreground';
  itemTitle.textContent = String(result.title || '');
  info.appendChild(itemTitle);

  const itemType = document.createElement('div');
  itemType.className = 'text-[0.67rem] text-foreground-muted';
  itemType.textContent = String(result.type || '');
  info.appendChild(itemType);

  item.appendChild(info);
  return item;
};

const renderQuickSearchResults = (query: string, results: QuickSearchResult[]): void => {
  if (!searchDropdown) {
    return;
  }

  if (!results || results.length === 0) {
    clearSearchResults();
    return;
  }

  const searchResults = document.createElement('div');
  searchResults.className = 'grid';

  const title = document.createElement('div');
  title.className = 'px-3 py-2 text-[0.68rem] text-foreground-muted';
  title.textContent = 'Anime';
  searchResults.appendChild(title);

  results.forEach((result: QuickSearchResult) => {
    searchResults.appendChild(buildSearchResultItem(result));
  });

  const viewAll = document.createElement('a');
  viewAll.className =
    'block bg-background-surface px-3 py-2 text-center text-[0.8rem] text-foreground-muted no-underline hover:bg-surface-hover hover:text-foreground hover:no-underline';
  viewAll.setAttribute('href', '/browse?q=' + encodeURIComponent(query));
  viewAll.textContent = 'Browse all results for ' + query;
  searchResults.appendChild(viewAll);

  searchDropdown.replaceChildren(searchResults);
};

const fetchAndRenderQuickSearch = (query: string): void => {
  fetch('/api/search-quick?q=' + encodeURIComponent(query))
    .then((res: Response) => res.json())
    .then((results: QuickSearchResult[]) => {
      renderQuickSearchResults(query, results);
    })
    .catch((err: unknown) => {
      console.error('Search error:', err);
    });
};

const onSearchInput = (event: Event): void => {
  if (searchTimeout) {
    window.clearTimeout(searchTimeout);
  }

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const query = target.value.trim();
  if (query.length < 2) {
    clearSearchResults();
    return;
  }

  searchTimeout = window.setTimeout(() => {
    fetchAndRenderQuickSearch(query);
  }, 300);
};

const onSearchBlur = (): void => {
  // delay to allow clicking on results before clearing
  window.setTimeout(() => {
    clearSearchResults();
  }, 200);
};

const onDocumentClick = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.matches('[data-search-dialog]')) {
    closeSearchDialog();
  }
};

const onDocumentKeydown = (event: KeyboardEvent): void => {
  const target = event.target;
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  if (event.key === 'Escape') {
    closeSearchDialog();
    return;
  }

  if (event.key === '/' && !isTyping) {
    event.preventDefault();
    openSearchDialog();
  }
};

const initQuickSearch = (): void => {
  if (globalWindow[searchInitializedKey]) {
    return;
  }
  globalWindow[searchInitializedKey] = true;

  if (!searchInput || !searchDropdown) {
    return;
  }

  searchOpenButtons.forEach((button) => {
    button.addEventListener('click', openSearchDialog);
  });
  searchCloseButtons.forEach((button) => {
    button.addEventListener('click', closeSearchDialog);
  });
  searchInput.addEventListener('input', onSearchInput);
  searchInput.addEventListener('blur', onSearchBlur);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
};

initQuickSearch();
