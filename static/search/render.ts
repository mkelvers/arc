import { dedupeByID, dedupeWithin } from "../dedupe";
import type { CommandPaletteItem } from "./state";
import {
  searchResults,
  searchClearButtons,
  responseCache,
  getResultItems,
  setResultItems,
  getSelectedIndex,
  setSelectedIndex,
  getLastQuery,
  resetSearchResultsState,
  iconPaths,
  typeLabels,
  groupOrder,
  maxPosterImageRetries,
  isSafeImageUrl,
} from "./state";

const watchlistOverrides = new Map<number, boolean>();

window.addEventListener("watchlist:change", (event) => {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  const detail = event.detail as { id?: unknown; inWatchlist?: unknown } | null;
  if (!detail || typeof detail.id !== "number" || typeof detail.inWatchlist !== "boolean") {
    return;
  }

  watchlistOverrides.set(detail.id, detail.inWatchlist);
});

export const setClearButtonState = (hasQuery: boolean): void => {
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

export const clearResults = (): void => {
  resetSearchResultsState();
  searchResults?.replaceChildren();
};

export const selectItem = (index: number, scrollIntoView: boolean): void => {
  const resultItems = getResultItems();
  if (!searchResults || resultItems.length === 0) {
    setSelectedIndex(0);
    return;
  }

  const selectedIndex = Math.max(0, Math.min(index, resultItems.length - 1));
  setSelectedIndex(selectedIndex);
  searchResults.querySelectorAll<HTMLElement>("[data-command-palette-item]").forEach((item) => {
    const selected = Number(item.dataset.resultIndex) === selectedIndex;
    item.classList.toggle("opacity-75", selected);
    item.setAttribute("aria-selected", String(selected));
    if (selected && scrollIntoView) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
};

export const runSelectedItem = (): void => {
  const item = getResultItems()[getSelectedIndex()];
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

export const removeContinueWatchingItem = (item: CommandPaletteItem): void => {
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
      renderItems(getResultItems().filter((candidate) => candidate.id !== item.id));
    })
    .catch((error) => {
      window.showToast?.({ message: "Failed to remove from Continue Watching." });
      console.error("failed to remove from continue watching:", error);
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

const animeMalID = (item: CommandPaletteItem): number | null => {
  if (item.type !== "anime") {
    return null;
  }

  const match = item.id.match(/^anime:(\d+)$/);
  if (!match) {
    return null;
  }

  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
};

const buildWatchlistButton = (item: CommandPaletteItem): HTMLButtonElement | null => {
  const malID = animeMalID(item);
  if (malID === null) {
    return null;
  }

  const button = document.createElement("button");
  const inWatchlist = watchlistOverrides.get(malID) ?? item.inWatchlist === true;
  button.type = "button";
  button.className =
    "absolute bottom-5 left-5 z-20 text-accent opacity-0 transition hover:text-accent/80 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50";
  button.dataset.watchlistToggle = "";
  button.dataset.malId = String(malID);
  button.dataset.watchlistTitle = cleanLabel(item);
  button.dataset.watchlistState = inWatchlist ? "in" : "out";
  button.setAttribute("aria-label", inWatchlist ? "Remove from Watchlist" : "Add to Watchlist");
  button.appendChild(buildSvgIcon(iconPaths.bookmark, "size-6 watchlist-icon"));
  return button;
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
  card.setAttribute("aria-selected", String(index === getSelectedIndex()));
  card.addEventListener("mouseenter", () => selectItem(index, false));

  const media = document.createElement("div");
  media.className = "relative mb-3 overflow-hidden bg-background-button";
  media.appendChild(buildPosterImage(item));

  const watchlistButton = buildWatchlistButton(item);
  if (watchlistButton) {
    media.appendChild(watchlistButton);
  }

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
  row.setAttribute("aria-selected", String(index === getSelectedIndex()));
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

export const renderEmptyState = (query: string): void => {
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

export const renderSearchErrorState = (query: string): void => {
  if (!searchResults) {
    return;
  }

  const empty = document.createElement("div");
  empty.className =
    "mx-auto flex min-h-80 w-full max-w-5xl flex-col justify-center px-5 py-14 text-center md:px-8";

  const title = document.createElement("div");
  title.className = "text-2xl font-semibold text-foreground";
  title.textContent = "Search is unavailable right now";
  empty.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "mx-auto mt-3 max-w-lg text-sm leading-6 text-foreground-muted";
  subtitle.textContent = query
    ? "Try again in a moment or narrow the search query."
    : "Try again in a moment.";
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

export const renderItems = (items: CommandPaletteItem[]): void => {
  if (!searchResults) {
    return;
  }

  setSelectedIndex(0);

  if (items.length === 0) {
    renderEmptyState(getLastQuery());
    return;
  }

  const shell = document.createElement("div");
  shell.className = "mx-auto w-full max-w-5xl px-5 py-9 md:px-8 md:py-12";

  const groups = groupedItems(dedupeByID(items, (item) => item.id));
  const keys = orderedGroupKeys(groups);
  setResultItems(keys.flatMap((key) => groups.get(key) || []));
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

export const appendItems = (items: CommandPaletteItem[]): void => {
  if (!searchResults || items.length === 0) {
    return;
  }

  const resultItems = getResultItems();
  const existingIDs = new Set(resultItems.map((item) => item.id));
  const nextItems = dedupeByID(items, (item) => item.id).filter(
    (item) => !existingIDs.has(item.id),
  );
  if (nextItems.length === 0) {
    return;
  }

  renderItems([...resultItems, ...nextItems]);
};
