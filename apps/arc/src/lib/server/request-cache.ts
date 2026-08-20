interface Cached<Value> {
    value: Value;
    expiresAt: number;
}

interface RequestCacheOptions {
    staleIfError?: boolean;
    staleWhileRevalidate?: boolean;
}

export class RequestCache<Key, Value> {
    readonly #lifetimeMs: number;
    readonly #values = new Map<Key, Cached<Value>>();
    readonly #requests = new Map<Key, Promise<Value>>();

    constructor(lifetimeMs: number) {
        if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) {
            throw new RangeError('Cache lifetime must be a positive integer');
        }

        this.#lifetimeMs = lifetimeMs;
    }

    async get(key: Key, load: () => Promise<Value>, options: RequestCacheOptions = {}) {
        const cached = this.#values.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return Promise.resolve(cached.value);
        }

        let request = this.#requests.get(key);
        if (!request) {
            request = Promise.resolve()
                .then(load)
                .then((value) => {
                    const completedAt = Date.now();
                    for (const [storedKey, stored] of this.#values) {
                        if (stored.expiresAt <= completedAt) {
                            this.#values.delete(storedKey);
                        }
                    }
                    this.#values.set(key, {
                        value,
                        expiresAt: completedAt + this.#lifetimeMs,
                    });
                    return value;
                });
            this.#requests.set(key, request);

            const cleanup = () => {
                if (this.#requests.get(key) === request) {
                    this.#requests.delete(key);
                }
            };
            request.then(cleanup, cleanup);
        }

        if (cached && options.staleWhileRevalidate) {
            void request.catch(() => undefined);
            return Promise.resolve(cached.value);
        }

        if (cached && options.staleIfError) {
            return request.catch(() => cached.value);
        }

        return request;
    }
}
