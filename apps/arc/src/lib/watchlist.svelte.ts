import {
    WatchlistStateResponseSchema,
    WatchlistStatesResponseSchema,
    type WatchlistState,
} from '@arc/core/browser';

export class WatchlistAuthenticationError extends Error {}

class WatchlistClient {
    private states = $state<Partial<Record<number, WatchlistState>>>({});
    loaded = $state(false);
    private activeLoad: Promise<void> | null = null;
    private mutations = new Map<number, Promise<void>>();

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

    private async setNow(animeId: number, state: WatchlistState, title?: string) {
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

    private async removeNow(animeId: number) {
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

    private enqueue<T>(animeId: number, mutation: () => Promise<T>) {
        const previous = this.mutations.get(animeId) ?? Promise.resolve();
        const request = previous.then(mutation, mutation);
        const settled = request.then(
            () => undefined,
            () => undefined
        );
        this.mutations.set(animeId, settled);
        void settled.then(() => {
            if (this.mutations.get(animeId) === settled) {
                this.mutations.delete(animeId);
            }
        });
        return request;
    }

    set(animeId: number, state: WatchlistState, title?: string) {
        return this.enqueue(animeId, () => this.setNow(animeId, state, title));
    }

    remove(animeId: number) {
        return this.enqueue(animeId, () => this.removeNow(animeId));
    }

    async toggle(animeId: number, title: string) {
        await this.load();

        return this.enqueue(animeId, async () => {
            if (this.state(animeId)) {
                await this.removeNow(animeId);
                return null;
            }

            return this.setNow(animeId, 'plan_to_watch', title);
        });
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
