import {
    WatchlistStateResponseSchema,
    WatchlistStatesResponseSchema,
    type WatchlistState,
} from '@arc/core/client';

export class WatchlistAuthenticationError extends Error {}

class WatchlistClient {
    private states = $state<Partial<Record<number, WatchlistState>>>({});
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

        const request = (async () => {
            const response = await fetch('/v1/watchlist/states', {
                headers: {
                    Accept: 'application/json',
                },
            });
            this.assertSuccessful(response);
            const { entries } = WatchlistStatesResponseSchema.parse(await response.json());
            this.states = Object.fromEntries(entries.map(({ animeId, state }) => [animeId, state]));
            this.loaded = true;
        })();
        this.activeLoad = request;

        try {
            await request;
        } finally {
            if (this.activeLoad === request) {
                this.activeLoad = null;
            }
        }
    }

    async refresh() {
        this.loaded = false;
        await this.load();
    }

    async set(animeId: number, state: WatchlistState, title?: string) {
        const response = await fetch(`/v1/watchlist/${animeId}`, {
            method: 'PUT',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                state,
                title,
            }),
        });
        this.assertSuccessful(response);
        const result = WatchlistStateResponseSchema.parse(await response.json());

        if (!result.state) {
            throw new Error('Watchlist update returned no state');
        }
        this.states = { ...this.states, [animeId]: result.state };
        return result.state;
    }

    async remove(animeId: number) {
        const response = await fetch(`/v1/watchlist/${animeId}`, {
            method: 'DELETE',
            headers: {
                Accept: 'application/json',
            },
        });
        this.assertSuccessful(response);

        const { [animeId]: _removed, ...remaining } = this.states;
        this.states = remaining;
    }

    async toggle(animeId: number, title: string) {
        await this.load();

        if (this.state(animeId)) {
            await this.remove(animeId);
            return null;
        }

        return this.set(animeId, 'plan_to_watch', title);
    }

    private assertSuccessful(response: Response) {
        if (response.status === 401) {
            throw new WatchlistAuthenticationError('Authentication required');
        }

        if (!response.ok) {
            throw new Error(`Watchlist request failed with ${response.status}`);
        }
    }
}

export const watchlist = new WatchlistClient();
