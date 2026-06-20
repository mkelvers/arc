export interface SearchItem {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
  image?: string;
  icon?: string;
  inWatchlist?: boolean;
}

export interface SearchResponse {
  items: SearchItem[];
  hasNextPage: boolean;
  nextPage?: number;
}

export const searchInitializedKey = Symbol("searchInitialized");
export const globalWindow = window as Window & { [searchInitializedKey]?: boolean };

export const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
export const searchResults = document.querySelector("[data-search-results]") as HTMLElement | null;
export const searchRoot = document.querySelector("[data-search-root]") as HTMLElement | null;
export const searchPage = document.querySelector("[data-search-page]") as HTMLElement | null;
export const searchClearButtons = document.querySelectorAll("[data-search-clear]");

let resultItems: SearchItem[] = [];
let selectedIndex = 0;
let fetchTimeout: number | undefined;
let lastQuery = "";
let activeRequestController: AbortController | undefined;
let nextSearchPage: number | undefined;
let searchHasNextPage = false;
let fetchingNextPage = false;

export const getResultItems = (): SearchItem[] => resultItems;

export const setResultItems = (items: SearchItem[]): void => {
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

const maxCachedResponses = 20;

const createResponseCache = () => {
  const responses = new Map<string, SearchResponse>();

  return {
    get(query: string): SearchResponse | undefined {
      const response = responses.get(query);
      if (!response) {
        return undefined;
      }

      responses.delete(query);
      responses.set(query, response);
      return response;
    },

    set(query: string, response: SearchResponse): void {
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

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const isSafeImageUrl = (rawUrl?: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (error) {
    console.error("Failed to validate URL:", error);
    return false;
  }
};
