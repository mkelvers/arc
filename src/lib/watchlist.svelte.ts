import { WatchlistEntriesSchema, type WatchlistState } from '$lib/watchlist';

export class WatchlistAuthenticationError extends Error {}

class WatchlistClient {
  states = $state<Record<number, WatchlistState>>({});
  loaded = $state(false);
  private activeLoad: Promise<void> | null = null;

  state(animeId: number) {
    return this.states[animeId] ?? null;
  }

  seed(animeId: number, state: WatchlistState) {
    if (!this.states[animeId]) {
      this.states = { ...this.states, [animeId]: state };
    }
  }

  async load() {
    if (this.loaded) {
      return;
    }
    if (this.activeLoad) {
      return this.activeLoad;
    }

    const request = this.request('/api/watchlist').then(async (response) => {
      const entries = WatchlistEntriesSchema.parse(await response.json());
      this.states = Object.fromEntries(entries.map(({ animeId, state }) => [animeId, state]));
      this.loaded = true;
    });
    this.activeLoad = request;

    try {
      await request;
    } finally {
      if (this.activeLoad === request) {
        this.activeLoad = null;
      }
    }
  }

  async set(animeId: number, state: WatchlistState) {
    const response = await this.request(`/api/watchlist/${animeId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    const result = WatchlistEntriesSchema.element.parse({
      animeId,
      ...(await response.json()),
    });

    this.states = { ...this.states, [animeId]: result.state };
    return result.state;
  }

  async remove(animeId: number) {
    await this.request(`/api/watchlist/${animeId}`, { method: 'DELETE' });

    const { [animeId]: _removed, ...remaining } = this.states;
    this.states = remaining;
  }

  async toggle(animeId: number) {
    await this.load();

    if (this.state(animeId)) {
      await this.remove(animeId);
      return null;
    }

    return this.set(animeId, 'plan_to_watch');
  }

  private async request(input: string, init?: RequestInit) {
    const response = await fetch(input, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });

    if (response.status === 401) {
      throw new WatchlistAuthenticationError('Authentication required');
    }
    if (!response.ok) {
      throw new Error(`Watchlist request failed with ${response.status}`);
    }

    return response;
  }
}

export const watchlist = new WatchlistClient();
