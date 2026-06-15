import type { CommandPaletteItem, CommandPaletteResponse } from "./state";
import {
  searchInput,
  searchResults,
  responseCache,
  getFetchTimeout,
  setFetchTimeout,
  setLastQuery,
  getLastQuery,
  getActiveRequestController,
  setActiveRequestController,
  setSearchPagination,
  getNextSearchPage,
  hasNextSearchPage,
  isFetchingNextPage,
  setFetchingNextPage,
} from "./state";
import {
  setClearButtonState,
  clearResults,
  renderEmptyState,
  renderItems,
  appendItems,
} from "./render";

const parseCommandPaletteResponse = (payload: unknown): CommandPaletteResponse => {
  if (Array.isArray(payload)) {
    return { items: payload as CommandPaletteItem[], hasNextPage: false };
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as CommandPaletteResponse).items)
  ) {
    const response = payload as CommandPaletteResponse;
    return {
      items: response.items,
      hasNextPage: response.hasNextPage,
      nextPage: response.nextPage,
    };
  }

  return { items: [], hasNextPage: false };
};

const visibleSearchItems = (items: CommandPaletteItem[], query: string): CommandPaletteItem[] => {
  if (query === "") {
    return [];
  }

  return items.filter((item) => item.type === "anime");
};

const renderPendingQuery = (query: string): void => {
  if (!query) {
    return;
  }

  clearResults();
};

export const cancelScheduledFetch = (): void => {
  const fetchTimeout = getFetchTimeout();
  if (!fetchTimeout) {
    return;
  }

  window.clearTimeout(fetchTimeout);
  setFetchTimeout(undefined);
};

export const fetchSearchItems = (query: string): void => {
  setLastQuery(query);
  setClearButtonState(query !== "");

  const activeRequestController = getActiveRequestController();
  if (activeRequestController) {
    activeRequestController.abort();
    setActiveRequestController(undefined);
  }

  if (query === "") {
    clearResults();
    renderEmptyState("");
    return;
  }

  const cached = responseCache.get(query);
  if (cached) {
    setSearchPagination(cached.nextPage, cached.hasNextPage);
    renderItems(visibleSearchItems(cached.items, query));
    return;
  }

  renderPendingQuery(query);

  const controller = new AbortController();
  setActiveRequestController(controller);

  fetch("/api/command-palette?q=" + encodeURIComponent(query), { signal: controller.signal })
    .then((res: Response) => {
      if (!res.ok) {
        return { items: [], hasNextPage: false };
      }
      return res.json();
    })
    .then((payload: unknown) => {
      if (controller.signal.aborted || query !== getLastQuery()) {
        return;
      }

      const response = parseCommandPaletteResponse(payload);
      const visibleItems = visibleSearchItems(response.items, query);
      setActiveRequestController(undefined);
      setSearchPagination(response.nextPage, response.hasNextPage);
      responseCache.set(query, response);
      renderItems(visibleItems);
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        return;
      }

      setActiveRequestController(undefined);
      console.error("Search overlay error:", err);
      renderItems([]);
    });
};

export const fetchNextSearchPage = (): void => {
  const query = getLastQuery();
  const page = getNextSearchPage();

  if (!query || !hasNextSearchPage() || !page || isFetchingNextPage()) {
    return;
  }

  setFetchingNextPage(true);

  fetch(
    "/api/command-palette?q=" +
      encodeURIComponent(query) +
      "&page=" +
      encodeURIComponent(String(page)),
  )
    .then((res: Response) => {
      if (!res.ok) {
        return { items: [], hasNextPage: false };
      }
      return res.json();
    })
    .then((payload: unknown) => {
      if (query !== getLastQuery()) {
        return;
      }

      const response = parseCommandPaletteResponse(payload);
      const visibleItems = visibleSearchItems(response.items, query);
      const cached = responseCache.get(query);
      if (cached) {
        responseCache.set(query, {
          items: [...cached.items, ...response.items],
          hasNextPage: response.hasNextPage,
          nextPage: response.nextPage,
        });
      }
      setSearchPagination(response.nextPage, response.hasNextPage);
      appendItems(visibleItems);
    })
    .catch((err: unknown) => {
      console.error("Search overlay pagination error:", err);
    })
    .finally(() => {
      setFetchingNextPage(false);
    });
};

export const onResultsScroll = (): void => {
  if (!searchResults) {
    return;
  }

  const remainingScroll =
    searchResults.scrollHeight - searchResults.scrollTop - searchResults.clientHeight;
  if (remainingScroll < 480) {
    fetchNextSearchPage();
  }
};

export const scheduleFetch = (): void => {
  const fetchTimeout = getFetchTimeout();
  if (fetchTimeout) {
    window.clearTimeout(fetchTimeout);
  }

  const query = searchInput?.value.trim() || "";
  setClearButtonState(query !== "");
  setFetchTimeout(window.setTimeout(() => fetchSearchItems(query), query.length >= 2 ? 240 : 80));
};
