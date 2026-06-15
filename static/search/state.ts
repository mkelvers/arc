export interface CommandPaletteItem {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
  image?: string;
  icon?: string;
}

export interface CommandPaletteResponse {
  items: CommandPaletteItem[];
  hasNextPage: boolean;
  nextPage?: number;
}

export const commandPaletteInitializedKey = Symbol("commandPaletteInitialized");
export const globalWindow = window as Window & { [commandPaletteInitializedKey]?: boolean };

export const searchInput = document.getElementById(
  "command-palette-input",
) as HTMLInputElement | null;
export const searchResults = document.querySelector(
  "[data-command-palette-results]",
) as HTMLElement | null;
export const searchDialog = document.querySelector(
  "[data-command-palette-dialog]",
) as HTMLElement | null;
export const searchRoot = document.querySelector(
  "[data-command-palette-root]",
) as HTMLElement | null;
export const searchPage = document.querySelector(
  "[data-command-palette-page]",
) as HTMLElement | null;
export const searchOpenButtons = document.querySelectorAll("[data-command-palette-open]");
export const searchCloseButtons = document.querySelectorAll("[data-command-palette-close]");
export const searchClearButtons = document.querySelectorAll("[data-command-palette-clear]");
export const shortcutHints = document.querySelectorAll("[data-command-palette-shortcut]");

let resultItems: CommandPaletteItem[] = [];
let selectedIndex = 0;
let fetchTimeout: number | undefined;
let lastQuery = "";
let activeRequestController: AbortController | undefined;
let nextSearchPage: number | undefined;
let searchHasNextPage = false;
let fetchingNextPage = false;
let lastFocusedSearchOpener: HTMLElement | null = null;

export const getResultItems = (): CommandPaletteItem[] => resultItems;

export const setResultItems = (items: CommandPaletteItem[]): void => {
  resultItems = items;
};

export const getSelectedIndex = (): number => selectedIndex;

export const setSelectedIndex = (index: number): void => {
  selectedIndex = index;
};

export const getLastQuery = (): string => lastQuery;

export const setLastQuery = (query: string): void => {
  lastQuery = query;
};

export const getFetchTimeout = (): number | undefined => fetchTimeout;

export const setFetchTimeout = (timeout: number | undefined): void => {
  fetchTimeout = timeout;
};

export const getActiveRequestController = (): AbortController | undefined =>
  activeRequestController;

export const setActiveRequestController = (controller: AbortController | undefined): void => {
  activeRequestController = controller;
};

export const getNextSearchPage = (): number | undefined => nextSearchPage;

export const hasNextSearchPage = (): boolean => searchHasNextPage;

export const setSearchPagination = (nextPage: number | undefined, hasNextPage: boolean): void => {
  nextSearchPage = nextPage;
  searchHasNextPage = hasNextPage;
};

export const isFetchingNextPage = (): boolean => fetchingNextPage;

export const setFetchingNextPage = (isFetching: boolean): void => {
  fetchingNextPage = isFetching;
};

export const resetSearchResultsState = (): void => {
  resultItems = [];
  selectedIndex = 0;
  nextSearchPage = undefined;
  searchHasNextPage = false;
  fetchingNextPage = false;
};

export const rememberSearchOpener = (): void => {
  lastFocusedSearchOpener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
};

export const focusLastSearchOpener = (): void => {
  lastFocusedSearchOpener?.focus();
};

const maxCachedResponses = 20;

const createResponseCache = () => {
  const responses = new Map<string, CommandPaletteResponse>();

  return {
    get(query: string): CommandPaletteResponse | undefined {
      const response = responses.get(query);
      if (!response) {
        return undefined;
      }

      responses.delete(query);
      responses.set(query, response);
      return response;
    },

    set(query: string, response: CommandPaletteResponse): void {
      if (responses.has(query)) {
        responses.delete(query);
      }

      responses.set(query, response);
      if (responses.size <= maxCachedResponses) {
        return;
      }

      const oldestResponse = responses.keys().next();
      if (!oldestResponse.done) {
        responses.delete(oldestResponse.value);
      }
    },

    clear(): void {
      responses.clear();
    },
  };
};

export const responseCache = createResponseCache();

export const iconPaths: Record<string, string> = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z",
  compass:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z",
  play: "M8 5v14l11-7z",
  search: "M11 19a8 8 0 1 1 5.65-2.35L21 21 M16.65 16.65 21 21",
  trending: "M3 17l6-6 4 4 8-8 M14 7h7v7",
};

export const typeLabels: Record<string, string> = {
  anime: "Top results",
};

export const groupOrder = ["anime"];
export const maxPosterImageRetries = 2;

export const isMac = (): boolean => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const isSearchOpen = (): boolean => searchDialog?.classList.contains("flex") ?? false;

export const isSafeImageUrl = (rawUrl?: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};
