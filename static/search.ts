import { dedupeByID, dedupeWithin } from "./dedupe";

interface CommandPaletteItem {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
  image?: string;
  icon?: string;
}

interface CommandPaletteResponse {
  items: CommandPaletteItem[];
  hasNextPage: boolean;
  nextPage?: number;
}

const commandPaletteInitializedKey = Symbol("commandPaletteInitialized");
const globalWindow = window as Window & { [commandPaletteInitializedKey]?: boolean };

const searchInput = document.getElementById("command-palette-input") as HTMLInputElement | null;
const searchResults = document.querySelector(
  "[data-command-palette-results]",
) as HTMLElement | null;
const searchDialog = document.querySelector("[data-command-palette-dialog]") as HTMLElement | null;
const searchRoot = document.querySelector("[data-command-palette-root]") as HTMLElement | null;
const searchOpenButtons = document.querySelectorAll("[data-command-palette-open]");
const searchCloseButtons = document.querySelectorAll("[data-command-palette-close]");
const searchClearButtons = document.querySelectorAll("[data-command-palette-clear]");
const shortcutHints = document.querySelectorAll("[data-command-palette-shortcut]");

let resultItems: CommandPaletteItem[] = [];
let selectedIndex = 0;
let fetchTimeout: number | undefined;
let lastQuery = "";
let activeRequestController: AbortController | undefined;
let nextSearchPage: number | undefined;
let hasNextSearchPage = false;
let isFetchingNextPage = false;
let lastFocusedSearchOpener: HTMLElement | null = null;
const responseCache = new Map<string, CommandPaletteResponse>();

const iconPaths: Record<string, string> = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z",
  compass:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z",
  play: "M8 5v14l11-7z",
  search: "M11 19a8 8 0 1 1 5.65-2.35L21 21 M16.65 16.65 21 21",
  trending: "M3 17l6-6 4 4 8-8 M14 7h7v7",
};

const typeLabels: Record<string, string> = {
  anime: "Top results",
};

const groupOrder = ["anime"];
const maxPosterImageRetries = 2;

const isMac = (): boolean => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const isSearchOpen = (): boolean => searchDialog?.classList.contains("flex") ?? false;

const isSafeImageUrl = (rawUrl?: string): boolean => {
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

const setSearchState = (open: boolean): void => {
  if (!searchDialog) {
    return;
  }

  searchDialog.classList.toggle("hidden", !open);
  searchDialog.classList.toggle("flex", open);
  searchDialog.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("overflow-hidden", open);
};

const setShortcutHints = (): void => {
  shortcutHints.forEach((hint) => {
    hint.textContent = isMac() ? "⌘P" : "Ctrl P";
  });
};

const setClearButtonState = (hasQuery: boolean): void => {
  searchClearButtons.forEach((button) => {
    button.classList.toggle("opacity-0", !hasQuery);
    button.classList.toggle("pointer-events-none", !hasQuery);
  });
};

const buildSvgIcon = (pathData: string, className: string): SVGSVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add(...className.split(" "));

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);

  return svg;
};

const buildFallbackIcon = (item: CommandPaletteItem): HTMLElement => {
  const icon = document.createElement("div");
  icon.className =
    "flex aspect-2/3 w-full items-center justify-center bg-background-button text-foreground-muted";

  const path = iconPaths[item.icon || "search"] || iconPaths.search;
  icon.appendChild(buildSvgIcon(path, "size-7"));
  return icon;
};

const buildPosterImage = (item: CommandPaletteItem): HTMLElement => {
  if (!isSafeImageUrl(item.image)) {
    return buildFallbackIcon(item);
  }

  const source = item.image || "";
  let retries = 0;
  const img = document.createElement("img");
  img.className = "aspect-2/3 w-full bg-background-button object-cover";
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (retries < maxPosterImageRetries) {
      retries += 1;
      const retryURL = new URL(source);
      retryURL.searchParams.set("_retry", String(retries));
      img.src = retryURL.toString();
      return;
    }

    img.replaceWith(buildFallbackIcon(item));
  });
  img.src = source;
  return img;
};

const clearResults = (): void => {
  resultItems = [];
  selectedIndex = 0;
  nextSearchPage = undefined;
  hasNextSearchPage = false;
  isFetchingNextPage = false;
  searchResults?.replaceChildren();
};

const cancelScheduledFetch = (): void => {
  if (!fetchTimeout) {
    return;
  }

  window.clearTimeout(fetchTimeout);
  fetchTimeout = undefined;
};

const selectItem = (index: number, scrollIntoView: boolean): void => {
  if (!searchResults || resultItems.length === 0) {
    selectedIndex = 0;
    return;
  }

  selectedIndex = Math.max(0, Math.min(index, resultItems.length - 1));
  searchResults.querySelectorAll<HTMLElement>("[data-command-palette-item]").forEach((item) => {
    const selected = Number(item.dataset.resultIndex) === selectedIndex;
    item.classList.toggle("opacity-75", selected);
    item.setAttribute("aria-selected", String(selected));
    if (selected && scrollIntoView) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
};

const runSelectedItem = (): void => {
  const item = resultItems[selectedIndex];
  if (!item) {
    return;
  }

  window.location.href = item.href;
};

const removeContinueWatchingCard = (animeID: string): void => {
  document.getElementById("continue-watching-" + animeID)?.remove();

  const section = document.getElementById("continue-watching-section");
  if (!section) {
    return;
  }

  if (section.querySelectorAll(".continue-watching-item").length === 0) {
    section.remove();
  }
};

const removeContinueWatchingItem = (item: CommandPaletteItem): void => {
  const animeID = item.id.replace("continue:", "");
  if (!animeID || animeID === item.id) {
    return;
  }

  fetch("/api/continue-watching/" + encodeURIComponent(animeID), { method: "DELETE" })
    .then((res: Response) => {
      if (!res.ok) {
        return;
      }

      responseCache.clear();
      removeContinueWatchingCard(animeID);
      renderItems(resultItems.filter((candidate) => candidate.id !== item.id));
    })
    .catch((err: unknown) => {
      console.error("Continue watching remove error:", err);
    });
};

const cleanLabel = (item: CommandPaletteItem): string => {
  if (item.type === "continue") {
    return item.label.replace(/^Continue watching\s+/i, "");
  }

  if (item.type === "navigation") {
    return item.label.replace(/^Go to\s+/i, "");
  }

  return item.label;
};

const buildCard = (item: CommandPaletteItem, index: number): HTMLAnchorElement => {
  const card = document.createElement("a");
  card.href = item.href;
  card.className =
    "group block min-w-0 text-foreground no-underline transition focus-visible:outline-none hover:no-underline";
  card.dataset.commandPaletteItem = item.id;
  card.dataset.id = item.id;
  card.dataset.resultIndex = String(index);
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", String(index === selectedIndex));
  card.addEventListener("mouseenter", () => selectItem(index, false));

  const media = document.createElement("div");
  media.className = "relative mb-3 overflow-hidden bg-background-button";
  media.appendChild(buildPosterImage(item));

  if (item.type === "continue") {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className =
      "absolute right-2 top-2 flex size-8 items-center justify-center bg-black/70 text-white opacity-0 transition hover:bg-black group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";
    removeButton.setAttribute("aria-label", "Remove from Continue Watching");
    removeButton.appendChild(buildSvgIcon("M18 6 6 18 M6 6l12 12", "size-4"));
    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeContinueWatchingItem(item);
    });
    media.appendChild(removeButton);
  }

  card.appendChild(media);

  const title = document.createElement("div");
  title.className = "line-clamp-2 text-sm font-semibold leading-snug text-foreground";
  title.textContent = cleanLabel(item);
  card.appendChild(title);

  if (item.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "mt-1 truncate text-xs font-medium text-foreground-muted";
    subtitle.textContent = item.subtitle;
    card.appendChild(subtitle);
  }

  return card;
};

const buildCompactItem = (item: CommandPaletteItem, index: number): HTMLAnchorElement => {
  const row = document.createElement("a");
  row.href = item.href;
  row.className =
    "group flex min-h-16 items-center gap-3 px-3 py-2 text-foreground no-underline transition hover:bg-surface-hover hover:no-underline focus-visible:outline-none";
  row.dataset.commandPaletteItem = item.id;
  row.dataset.id = item.id;
  row.dataset.resultIndex = String(index);
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(index === selectedIndex));
  row.addEventListener("mouseenter", () => selectItem(index, false));

  const thumb = document.createElement("div");
  thumb.className = "w-11 shrink-0 overflow-hidden";
  thumb.appendChild(buildPosterImage(item));
  row.appendChild(thumb);

  const copy = document.createElement("div");
  copy.className = "min-w-0 flex-1";

  const title = document.createElement("div");
  title.className = "truncate text-sm font-semibold text-foreground";
  title.textContent = cleanLabel(item);
  copy.appendChild(title);

  if (item.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "mt-0.5 truncate text-xs text-foreground-muted";
    subtitle.textContent = item.subtitle;
    copy.appendChild(subtitle);
  }

  row.appendChild(copy);
  return row;
};

const buildSection = (
  title: string,
  items: CommandPaletteItem[],
  startIndex: number,
  variant: "grid" | "compact",
): HTMLElement => {
  const section = document.createElement("section");
  section.className = "min-w-0";

  const heading = document.createElement("h2");
  heading.className = "mb-4 text-base font-bold text-foreground md:text-lg";
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement("div");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", title);
  list.className =
    variant === "grid"
      ? "grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4"
      : "grid gap-1 sm:grid-cols-2";

  items.forEach((item, itemIndex) => {
    const index = startIndex + itemIndex;
    list.appendChild(variant === "grid" ? buildCard(item, index) : buildCompactItem(item, index));
  });

  section.appendChild(list);
  return section;
};

const renderEmptyState = (query: string): void => {
  if (!searchResults) {
    return;
  }

  const empty = document.createElement("div");
  empty.className =
    "mx-auto flex min-h-80 w-full max-w-5xl flex-col justify-center px-5 py-14 text-center md:px-8";

  const title = document.createElement("div");
  title.className = "text-2xl font-semibold text-foreground";
  title.textContent = query ? "No results found" : "Start typing to search your anime";
  empty.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "mx-auto mt-3 max-w-lg text-sm leading-6 text-foreground-muted";
  subtitle.textContent = query
    ? "Try a shorter title, alternate spelling, or browse the full search results."
    : "Search opens title results first, then your watchlist and quick links when they matter.";
  empty.appendChild(subtitle);

  searchResults.replaceChildren(empty);
};

const groupedItems = (items: CommandPaletteItem[]): Map<string, CommandPaletteItem[]> => {
  const groups = new Map<string, CommandPaletteItem[]>();
  items.forEach((item) => {
    const key = item.type in typeLabels ? item.type : "anime";
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });
  return groups;
};

const orderedGroupKeys = (groups: Map<string, CommandPaletteItem[]>): string[] => {
  return groupOrder.filter((key) => groups.has(key));
};

const renderItems = (items: CommandPaletteItem[]): void => {
  if (!searchResults) {
    return;
  }

  selectedIndex = 0;

  if (items.length === 0) {
    renderEmptyState(lastQuery);
    return;
  }

  const shell = document.createElement("div");
  shell.className = "mx-auto w-full max-w-5xl px-5 py-9 md:px-8 md:py-12";

  const groups = groupedItems(dedupeByID(items, (item) => item.id));
  const keys = orderedGroupKeys(groups);
  resultItems = keys.flatMap((key) => groups.get(key) || []);
  let cursor = 0;

  keys.forEach((key) => {
    const groupItems = groups.get(key);
    if (!groupItems) {
      return;
    }

    const variant = key === "anime" ? "grid" : "compact";
    const section = buildSection(typeLabels[key] || "Results", groupItems, cursor, variant);
    section.classList.add("mb-12");
    shell.appendChild(section);
    cursor += groupItems.length;
  });

  searchResults.replaceChildren(shell);
  shell.querySelectorAll<HTMLElement>("[role='listbox']").forEach((list) => dedupeWithin(list));
  selectItem(0, false);
};

const appendItems = (items: CommandPaletteItem[]): void => {
  if (!searchResults || items.length === 0) {
    return;
  }

  const existingIDs = new Set(resultItems.map((item) => item.id));
  const nextItems = dedupeByID(items, (item) => item.id).filter((item) => !existingIDs.has(item.id));
  if (nextItems.length === 0) {
    return;
  }

  renderItems([...resultItems, ...nextItems]);
};

const visibleSearchItems = (items: CommandPaletteItem[], query: string): CommandPaletteItem[] => {
  if (query === "") {
    return [];
  }

  return items.filter((item) => item.type === "anime");
};

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

const renderPendingQuery = (query: string): void => {
  if (!query) {
    return;
  }

  clearResults();
};

const fetchSearchItems = (query: string): void => {
  lastQuery = query;
  setClearButtonState(query !== "");

  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = undefined;
  }

  if (query === "") {
    clearResults();
    return;
  }

  const cached = responseCache.get(query);
  if (cached) {
    nextSearchPage = cached.nextPage;
    hasNextSearchPage = cached.hasNextPage;
    renderItems(visibleSearchItems(cached.items, query));
    return;
  }

  renderPendingQuery(query);

  const controller = new AbortController();
  activeRequestController = controller;

  fetch("/api/command-palette?q=" + encodeURIComponent(query), { signal: controller.signal })
    .then((res: Response) => {
      if (!res.ok) {
        return { items: [], hasNextPage: false };
      }
      return res.json();
    })
    .then((payload: unknown) => {
      if (controller.signal.aborted || query !== lastQuery) {
        return;
      }

      const response = parseCommandPaletteResponse(payload);
      const visibleItems = visibleSearchItems(response.items, query);
      activeRequestController = undefined;
      nextSearchPage = response.nextPage;
      hasNextSearchPage = response.hasNextPage;
      responseCache.set(query, response);
      renderItems(visibleItems);
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        return;
      }

      activeRequestController = undefined;
      console.error("Search overlay error:", err);
      renderItems([]);
    });
};

const fetchNextSearchPage = (): void => {
  if (!lastQuery || !hasNextSearchPage || !nextSearchPage || isFetchingNextPage) {
    return;
  }

  isFetchingNextPage = true;
  const query = lastQuery;
  const page = nextSearchPage;

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
      if (query !== lastQuery) {
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
      nextSearchPage = response.nextPage;
      hasNextSearchPage = response.hasNextPage;
      appendItems(visibleItems);
    })
    .catch((err: unknown) => {
      console.error("Search overlay pagination error:", err);
    })
    .finally(() => {
      isFetchingNextPage = false;
    });
};

const onResultsScroll = (): void => {
  if (!searchResults) {
    return;
  }

  const remainingScroll =
    searchResults.scrollHeight - searchResults.scrollTop - searchResults.clientHeight;
  if (remainingScroll < 480) {
    fetchNextSearchPage();
  }
};

const scheduleFetch = (): void => {
  if (fetchTimeout) {
    window.clearTimeout(fetchTimeout);
  }

  const query = searchInput?.value.trim() || "";
  setClearButtonState(query !== "");
  fetchTimeout = window.setTimeout(() => fetchSearchItems(query), query.length >= 2 ? 240 : 80);
};

const openSearch = (): void => {
  if (!searchDialog || !searchInput) {
    return;
  }

  lastFocusedSearchOpener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setSearchState(true);
  searchInput.value = "";
  lastQuery = "";
  cancelScheduledFetch();
  setClearButtonState(false);
  clearResults();
  searchInput.focus();
};

const closeSearch = (): void => {
  if (!searchDialog || !searchInput) {
    return;
  }

  setSearchState(false);
  cancelScheduledFetch();
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = undefined;
  }
  searchInput.value = "";
  lastQuery = "";
  setClearButtonState(false);
  clearResults();
  lastFocusedSearchOpener?.focus();
};

const clearSearchInput = (): void => {
  if (!searchInput) {
    return;
  }

  searchInput.value = "";
  searchInput.focus();
  cancelScheduledFetch();
  setClearButtonState(false);
  fetchSearchItems("");
};

const onDocumentClick = (event: MouseEvent): void => {
  if (event.target === searchDialog) {
    closeSearch();
  }
};

const onInputKeydown = (event: KeyboardEvent): void => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectItem(selectedIndex + 1, true);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectItem(selectedIndex - 1, true);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    runSelectedItem();
  }
};

const onDocumentKeydown = (event: KeyboardEvent): void => {
  const commandShortcut = event.key.toLowerCase() === "p" && (event.metaKey || event.ctrlKey);

  if (commandShortcut && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (isSearchOpen()) {
      closeSearch();
    } else {
      openSearch();
    }
    return;
  }

  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    openSearch();
    return;
  }

  if (event.key === "Escape" && isSearchOpen()) {
    event.preventDefault();
    closeSearch();
  }
};

const initSearchOverlay = (): void => {
  if (globalWindow[commandPaletteInitializedKey]) {
    return;
  }
  globalWindow[commandPaletteInitializedKey] = true;

  if (!searchInput || !searchResults || !searchRoot) {
    return;
  }

  setShortcutHints();
  searchOpenButtons.forEach((button) => {
    button.addEventListener("click", openSearch);
  });
  searchCloseButtons.forEach((button) => {
    button.addEventListener("click", closeSearch);
  });
  searchClearButtons.forEach((button) => {
    button.addEventListener("click", clearSearchInput);
  });
  searchInput.addEventListener("input", scheduleFetch);
  searchInput.addEventListener("keydown", onInputKeydown);
  searchResults.addEventListener("scroll", onResultsScroll);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  searchDialog?.setAttribute("aria-hidden", "true");
};

initSearchOverlay();
