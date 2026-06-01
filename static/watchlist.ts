export {};

type WatchlistStatus = "watching" | "completed" | "plan_to_watch" | "dropped";

type WatchlistUpdateDisplay =
  | "Watching"
  | "Completed"
  | "Plan to Watch"
  | "Dropped"
  | "Add to Watchlist";

const watchlistIds = new Set<number>();
const inflight = new Set<number>();

const getShowToast = (): ((opts: { message: string; duration?: number }) => void) | null => {
  const anyWindow = window as unknown as {
    showToast?: (opts: { message: string; duration?: number }) => void;
  };
  return typeof anyWindow.showToast === "function" ? anyWindow.showToast : null;
};

const toast = (message: string): void => {
  getShowToast()?.({ message });
};

const toInt = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("timeout")), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
    }
  }
};

const requestJson = async (input: string, init: RequestInit): Promise<Response> =>
  withTimeout(fetch(input, init), 12_000);

const syncRemoveButtonVisibility = (id: number): void => {
  const container = document.getElementById(`remove-watchlist-container-${id}`);
  if (!container) return;
  container.classList.toggle("hidden", !watchlistIds.has(id));
};

const syncWatchlistDropdown = (id: number, inWatchlist: boolean): void => {
  const statusDisplay = document.getElementById(`watchlist-status-display-${id}`);
  if (!statusDisplay) return;
  statusDisplay.textContent = inWatchlist ? "Plan to Watch" : "Add to Watchlist";
  syncRemoveButtonVisibility(id);
};

const syncIconsForId = (id: number): void => {
  const shouldBeInWatchlist = watchlistIds.has(id);
  document
    .querySelectorAll<HTMLElement>("[data-watchlist-toggle][data-mal-id]")
    .forEach((button) => {
      const malId = toInt(button.dataset.malId);
      if (malId !== id) return;
      button.classList.toggle("in-watchlist", shouldBeInWatchlist);
      button.dataset.watchlistState = shouldBeInWatchlist ? "in" : "out";
      button.setAttribute(
        "aria-label",
        shouldBeInWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
      );
      button.toggleAttribute("aria-busy", inflight.has(id));
    });
};

const setBusy = (id: number, busy: boolean): void => {
  if (busy) {
    inflight.add(id);
  } else {
    inflight.delete(id);
  }

  document
    .querySelectorAll<HTMLButtonElement>("[data-watchlist-toggle][data-mal-id]")
    .forEach((button) => {
      const malId = toInt(button.dataset.malId);
      if (malId !== id) return;
      button.disabled = busy;
      button.toggleAttribute("aria-busy", busy);
    });

  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-watchlist-update][data-mal-id], [data-watchlist-remove][data-mal-id]",
    )
    .forEach((button) => {
      const malId = toInt(button.dataset.malId);
      if (malId !== id) return;
      button.disabled = busy;
      button.toggleAttribute("aria-busy", busy);
    });
};

const closeClosestDropdown = (from: HTMLElement): void => {
  requestAnimationFrame(() => {
    const dropdown = from.closest("ui-dropdown") as { close?: () => void } | null;
    dropdown?.close?.();
  });
};

const toggleWatchlist = async (
  id: number,
  title: string,
  renderedState: string | undefined,
): Promise<void> => {
  if (inflight.has(id)) return;
  if (renderedState === "in") {
    watchlistIds.add(id);
  } else if (renderedState === "out") {
    watchlistIds.delete(id);
  }

  const isInWatchlist = watchlistIds.has(id);

  setBusy(id, true);

  const optimisticNext = !isInWatchlist;
  if (optimisticNext) {
    watchlistIds.add(id);
  } else {
    watchlistIds.delete(id);
  }
  syncIconsForId(id);
  syncWatchlistDropdown(id, optimisticNext);

  const url = isInWatchlist ? `/api/watchlist/${id}` : "/api/watchlist";
  const method: "DELETE" | "POST" = isInWatchlist ? "DELETE" : "POST";
  const body = isInWatchlist
    ? null
    : JSON.stringify({ animeId: id, status: "plan_to_watch" satisfies WatchlistStatus });

  try {
    const response = await requestJson(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ?? undefined,
    });

    if (!response.ok) {
      throw new Error("not ok");
    }

    toast(optimisticNext ? `Added ${title} to watchlist` : `Removed ${title} from watchlist`);
  } catch {
    if (optimisticNext) {
      watchlistIds.delete(id);
    } else {
      watchlistIds.add(id);
    }
    syncIconsForId(id);
    syncWatchlistDropdown(id, watchlistIds.has(id));
    toast("Failed to update watchlist");
  } finally {
    setBusy(id, false);
    syncIconsForId(id);
    syncRemoveButtonVisibility(id);
  }
};

type WatchlistSort = "date" | "title";

const csvEscape = (value: unknown): string => {
  const str = String(value ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const watchlistItems = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".watchlist-item"));

const sortVisibleWatchlistItems = (sortBy: WatchlistSort, desc: boolean): void => {
  const grids: HTMLElement[] = [];

  const singleGrid = document.getElementById("watchlist-items");
  if (singleGrid) {
    grids.push(singleGrid);
  }

  document
    .querySelectorAll<HTMLElement>(".watchlist-section .grid")
    .forEach((grid) => grids.push(grid));

  const sortItemsInGrid = (grid: HTMLElement): void => {
    const items = Array.from(grid.querySelectorAll<HTMLElement>(".watchlist-item"));
    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "title") {
        const titleA = (a.querySelector("h3")?.textContent ?? "").toLowerCase().trim();
        const titleB = (b.querySelector("h3")?.textContent ?? "").toLowerCase().trim();
        comparison = titleA.localeCompare(titleB);
      } else {
        const dateA = Number.parseInt(a.dataset.updatedAt ?? "0", 10) || 0;
        const dateB = Number.parseInt(b.dataset.updatedAt ?? "0", 10) || 0;
        comparison = dateA - dateB;
      }
      return desc ? -comparison : comparison;
    });
    items.forEach((item) => grid.appendChild(item));
  };

  grids.forEach(sortItemsInGrid);
};

const setActiveFilterButton = (clicked: HTMLButtonElement): void => {
  const parent = clicked.parentElement;
  if (!parent) return;
  parent.querySelectorAll("button").forEach((b) => {
    b.classList.remove("text-foreground");
    b.classList.add("text-foreground-muted");
    b.classList.remove("border-accent");
    b.classList.add("border-transparent");
  });
  clicked.classList.remove("text-foreground-muted");
  clicked.classList.add("text-foreground");
  clicked.classList.remove("border-transparent");
  clicked.classList.add("border-accent");
};

const applyWatchlistFilter = (status: string): void => {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(".watchlist-section"));
  if (sections.length) {
    sections.forEach((section) => {
      if (status === "all") {
        section.style.display = "block";
        return;
      }
      section.style.display = section.dataset.status === status ? "block" : "none";
    });
    return;
  }

  watchlistItems().forEach((item) => {
    if (status === "all") {
      item.style.display = "flex";
      return;
    }
    item.style.display = item.dataset.status === status ? "flex" : "none";
  });
};

const exportWatchlistCsv = (): void => {
  const rows = watchlistItems()
    .slice()
    .sort((a, b) => {
      const dateA = Number.parseInt(a.dataset.updatedAt ?? "0", 10) || 0;
      const dateB = Number.parseInt(b.dataset.updatedAt ?? "0", 10) || 0;
      return dateB - dateA;
    })
    .map((item) => {
      const updatedAt = Number.parseInt(item.dataset.updatedAt ?? "0", 10) || 0;
      const updatedAtISO = updatedAt > 0 ? new Date(updatedAt * 1000).toISOString() : "";
      const title = item.dataset.title || item.querySelector("h3")?.textContent?.trim() || "";
      return [item.dataset.malId || "", title, item.dataset.status || "", updatedAtISO];
    });

  const csv = [["mal_id", "title", "status", "updated_at"], ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "watchlist.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const initWatchlistPage = (): void => {
  let currentSortBy: WatchlistSort = "date";
  let sortOrderDesc = true;

  sortVisibleWatchlistItems(currentSortBy, sortOrderDesc);

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const filterBtn = target.closest<HTMLButtonElement>("button[data-watchlist-filter]");
    if (filterBtn) {
      const status = filterBtn.dataset.watchlistFilter ?? "all";
      setActiveFilterButton(filterBtn);
      applyWatchlistFilter(status);
      sortVisibleWatchlistItems(currentSortBy, sortOrderDesc);
      return;
    }

    const sortBtn = target.closest<HTMLButtonElement>("button[data-watchlist-sort]");
    if (sortBtn) {
      const sortBy = sortBtn.dataset.watchlistSort === "title" ? "title" : "date";
      currentSortBy = sortBy;
      const display = document.getElementById("sort-by-display");
      if (display) {
        display.textContent = currentSortBy === "date" ? "Date Added" : "Title";
      }

      const dropdownContent = sortBtn.closest("[data-content]");
      dropdownContent?.querySelectorAll("button").forEach((b) => {
        b.classList.remove("text-foreground");
        b.classList.add("text-foreground-muted");
      });
      sortBtn.classList.remove("text-foreground-muted");
      sortBtn.classList.add("text-foreground");

      sortVisibleWatchlistItems(currentSortBy, sortOrderDesc);

      const parentDropdown = sortBtn.closest("ui-dropdown") as { close?: () => void } | null;
      parentDropdown?.close?.();
      return;
    }

    const sortOrderBtn = target.closest<HTMLButtonElement>("button[data-watchlist-sort-order]");
    if (sortOrderBtn) {
      sortOrderDesc = !sortOrderDesc;
      const icon = sortOrderBtn.querySelector("svg");
      icon?.classList.toggle("rotate-180", !sortOrderDesc);
      sortVisibleWatchlistItems(currentSortBy, sortOrderDesc);
      return;
    }

    const exportBtn = target.closest<HTMLButtonElement>("button[data-watchlist-export]");
    if (exportBtn) {
      exportWatchlistCsv();
      return;
    }
  });
};

const updateWatchlist = async (
  id: number,
  status: WatchlistStatus,
  display: WatchlistUpdateDisplay,
  title: string,
  source: HTMLElement,
): Promise<void> => {
  if (inflight.has(id)) return;
  setBusy(id, true);

  const wasInWatchlist = watchlistIds.has(id);
  watchlistIds.add(id);
  syncIconsForId(id);
  syncRemoveButtonVisibility(id);

  try {
    const response = await requestJson("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animeId: id, status }),
    });

    if (!response.ok) {
      throw new Error("not ok");
    }

    const statusDisplay = document.getElementById(`watchlist-status-display-${id}`);
    if (statusDisplay) {
      statusDisplay.textContent = display;
    }

    closeClosestDropdown(source);
    toast(`Marked ${title} as ${display}`);
  } catch {
    if (!wasInWatchlist) {
      watchlistIds.delete(id);
    }
    syncIconsForId(id);
    syncRemoveButtonVisibility(id);
    toast("Failed to update watchlist");
  } finally {
    setBusy(id, false);
  }
};

const removeWatchlist = async (id: number, title: string, source: HTMLElement): Promise<void> => {
  if (inflight.has(id)) return;
  setBusy(id, true);

  const wasInWatchlist = watchlistIds.has(id);
  watchlistIds.delete(id);
  syncIconsForId(id);
  syncWatchlistDropdown(id, false);

  try {
    const response = await requestJson(`/api/watchlist/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("not ok");
    }

    closeClosestDropdown(source);
    toast(`Removed ${title} from watchlist`);

    const card = source.closest(".watchlist-item");
    if (card instanceof HTMLElement) {
      card.remove();
      const remaining = document.querySelectorAll(".watchlist-item").length;
      if (remaining === 0) {
        window.setTimeout(() => window.location.reload(), 50);
      }
    }
  } catch {
    if (wasInWatchlist) {
      watchlistIds.add(id);
    }
    syncIconsForId(id);
    syncWatchlistDropdown(id, watchlistIds.has(id));
    toast("Failed to update watchlist");
  } finally {
    setBusy(id, false);
    syncRemoveButtonVisibility(id);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWatchlistPage);
} else {
  initWatchlistPage();
}

const initWatchlist = (ids: number[]): void => {
  ids.forEach((id) => watchlistIds.add(id));
  ids.forEach((id) => {
    syncRemoveButtonVisibility(id);
    syncIconsForId(id);
  });
};

const getRenderedWatchlistIds = (): number[] => {
  const ids = new Set<number>();

  document
    .querySelectorAll<HTMLElement>(
      '[data-watchlist-toggle][data-watchlist-state="in"][data-mal-id]',
    )
    .forEach((button) => {
      const id = toInt(button.dataset.malId);
      if (id === null) return;
      ids.add(id);
    });

  return Array.from(ids);
};

const installDelegatedHandlers = (): void => {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggleButton = target.closest("[data-watchlist-toggle]") as HTMLElement | null;
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();

      const id = toInt(toggleButton.getAttribute("data-mal-id") ?? undefined);
      if (id === null) return;
      const title = toggleButton.getAttribute("data-watchlist-title") ?? "anime";
      void toggleWatchlist(id, title, toggleButton.dataset.watchlistState);
      return;
    }

    const updateButton = target.closest("[data-watchlist-update]") as HTMLElement | null;
    if (updateButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = toInt(updateButton.getAttribute("data-mal-id") ?? undefined);
      if (id === null) return;
      const status = updateButton.getAttribute("data-watchlist-status") as WatchlistStatus | null;
      const display = updateButton.getAttribute(
        "data-watchlist-display",
      ) as WatchlistUpdateDisplay | null;
      const title = updateButton.getAttribute("data-watchlist-title") ?? "anime";
      if (!status || !display) return;
      void updateWatchlist(id, status, display, title, updateButton);
      return;
    }

    const removeButton = target.closest("[data-watchlist-remove]") as HTMLElement | null;
    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = toInt(removeButton.getAttribute("data-mal-id") ?? undefined);
      if (id === null) return;
      const title = removeButton.getAttribute("data-watchlist-title") ?? "anime";
      void removeWatchlist(id, title, removeButton);
    }
  });
};

declare global {
  interface Window {
    initWatchlist: (ids: number[]) => void;
    __WATCHLIST_IDS__?: unknown;
  }
}

window.initWatchlist = initWatchlist;

onReady(() => {
  const raw = window.__WATCHLIST_IDS__;
  if (Array.isArray(raw)) {
    const ids: number[] = raw.filter((entry): entry is number => typeof entry === "number");
    if (ids.length > 0) {
      initWatchlist(ids);
    }
  }

  const renderedWatchlistIds = getRenderedWatchlistIds();
  if (renderedWatchlistIds.length > 0) {
    initWatchlist(renderedWatchlistIds);
  }

  installDelegatedHandlers();
});
import { onReady } from "./utils";
