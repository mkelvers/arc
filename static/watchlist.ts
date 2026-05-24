export {};

type WatchlistStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped';

type WatchlistUpdateDisplay =
  | 'Watching'
  | 'Completed'
  | 'Plan to Watch'
  | 'Dropped'
  | 'Add to Watchlist';

const watchlistIds = new Set<number>();
const inflight = new Set<number>();

const getShowToast = (): ((opts: { message: string; duration?: number }) => void) | null => {
  const anyWindow = window as unknown as {
    showToast?: (opts: { message: string; duration?: number }) => void;
  };
  return typeof anyWindow.showToast === 'function' ? anyWindow.showToast : null;
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
    timeoutId = window.setTimeout(() => reject(new Error('timeout')), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId);
    }
  }
};

const requestJson = async (input: string, init: RequestInit): Promise<Response> =>
  withTimeout(fetch(input, init), 12_000);

const syncRemoveButtonVisibility = (id: number): void => {
  const container = document.getElementById(`remove-watchlist-container-${id}`);
  if (!container) return;
  container.classList.toggle('hidden', !watchlistIds.has(id));
};

const syncWatchlistDropdown = (id: number, inWatchlist: boolean): void => {
  const statusDisplay = document.getElementById(`watchlist-status-display-${id}`);
  if (!statusDisplay) return;
  statusDisplay.textContent = inWatchlist ? 'Plan to Watch' : 'Add to Watchlist';
  syncRemoveButtonVisibility(id);
};

const syncIconsForId = (id: number): void => {
  const shouldBeInWatchlist = watchlistIds.has(id);
  document.querySelectorAll<HTMLElement>('[data-watchlist-toggle][data-mal-id]').forEach(button => {
    const malId = toInt(button.dataset.malId);
    if (malId !== id) return;
    button.classList.toggle('in-watchlist', shouldBeInWatchlist);
    button.setAttribute(
      'aria-label',
      shouldBeInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'
    );
    button.toggleAttribute('aria-busy', inflight.has(id));
  });
};

const setBusy = (id: number, busy: boolean): void => {
  if (busy) {
    inflight.add(id);
  } else {
    inflight.delete(id);
  }

  document
    .querySelectorAll<HTMLButtonElement>('[data-watchlist-toggle][data-mal-id]')
    .forEach(button => {
      const malId = toInt(button.dataset.malId);
      if (malId !== id) return;
      button.disabled = busy;
      button.toggleAttribute('aria-busy', busy);
    });

  document
    .querySelectorAll<HTMLButtonElement>(
      '[data-watchlist-update][data-mal-id], [data-watchlist-remove][data-mal-id]'
    )
    .forEach(button => {
      const malId = toInt(button.dataset.malId);
      if (malId !== id) return;
      button.disabled = busy;
      button.toggleAttribute('aria-busy', busy);
    });
};

const closeClosestDropdown = (from: HTMLElement): void => {
  requestAnimationFrame(() => {
    const dropdown = from.closest('ui-dropdown') as { close?: () => void } | null;
    dropdown?.close?.();
  });
};

const toggleWatchlist = async (id: number, title: string): Promise<void> => {
  if (inflight.has(id)) return;
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

  const url = isInWatchlist ? `/api/watchlist/${id}` : '/api/watchlist';
  const method: 'DELETE' | 'POST' = isInWatchlist ? 'DELETE' : 'POST';
  const body = isInWatchlist
    ? null
    : JSON.stringify({ animeId: id, status: 'plan_to_watch' satisfies WatchlistStatus });

  try {
    const response = await requestJson(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ?? undefined,
    });

    if (!response.ok) {
      throw new Error('not ok');
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
    toast('Failed to update watchlist');
  } finally {
    setBusy(id, false);
    syncIconsForId(id);
    syncRemoveButtonVisibility(id);
  }
};

const updateWatchlist = async (
  id: number,
  status: WatchlistStatus,
  display: WatchlistUpdateDisplay,
  title: string,
  source: HTMLElement
): Promise<void> => {
  if (inflight.has(id)) return;
  setBusy(id, true);

  const wasInWatchlist = watchlistIds.has(id);
  watchlistIds.add(id);
  syncIconsForId(id);
  syncRemoveButtonVisibility(id);

  try {
    const response = await requestJson('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animeId: id, status }),
    });

    if (!response.ok) {
      throw new Error('not ok');
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
    toast('Failed to update watchlist');
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
    const response = await requestJson(`/api/watchlist/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('not ok');
    }

    closeClosestDropdown(source);
    toast(`Removed ${title} from watchlist`);

    const card = source.closest('.watchlist-item');
    if (card instanceof HTMLElement) {
      card.remove();
      const remaining = document.querySelectorAll('.watchlist-item').length;
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
    toast('Failed to update watchlist');
  } finally {
    setBusy(id, false);
    syncRemoveButtonVisibility(id);
  }
};

const initWatchlist = (ids: number[]): void => {
  ids.forEach(id => watchlistIds.add(id));
  ids.forEach(id => {
    syncRemoveButtonVisibility(id);
    syncIconsForId(id);
  });
};

const onReady = (fn: () => void): void => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
    return;
  }

  fn();
};

const installDelegatedHandlers = (): void => {
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggleButton = target.closest('[data-watchlist-toggle]') as HTMLElement | null;
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();

      const id = toInt(toggleButton.getAttribute('data-mal-id') ?? undefined);
      if (id === null) return;
      const title = toggleButton.getAttribute('data-watchlist-title') ?? 'anime';
      void toggleWatchlist(id, title);
      return;
    }

    const updateButton = target.closest('[data-watchlist-update]') as HTMLElement | null;
    if (updateButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = toInt(updateButton.getAttribute('data-mal-id') ?? undefined);
      if (id === null) return;
      const status = updateButton.getAttribute('data-watchlist-status') as WatchlistStatus | null;
      const display = updateButton.getAttribute(
        'data-watchlist-display'
      ) as WatchlistUpdateDisplay | null;
      const title = updateButton.getAttribute('data-watchlist-title') ?? 'anime';
      if (!status || !display) return;
      void updateWatchlist(id, status, display, title, updateButton);
      return;
    }

    const removeButton = target.closest('[data-watchlist-remove]') as HTMLElement | null;
    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = toInt(removeButton.getAttribute('data-mal-id') ?? undefined);
      if (id === null) return;
      const title = removeButton.getAttribute('data-watchlist-title') ?? 'anime';
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
    const ids: number[] = raw.filter((entry): entry is number => typeof entry === 'number');
    if (ids.length > 0) {
      initWatchlist(ids);
    }
  }

  installDelegatedHandlers();
});
