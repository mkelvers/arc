interface Cached<Value> {
  value: Value;
  expiresAt: number;
}

interface RequestCacheOptions {
  staleIfError?: boolean;
  staleWhileRevalidate?: boolean;
}

export class RequestCache<Key, Value> {
  readonly #values = new Map<Key, Cached<Value>>();
  readonly #requests = new Map<Key, Promise<Value>>();

  constructor(readonly lifetime: number) {
    if (!Number.isSafeInteger(lifetime) || lifetime <= 0) {
      throw new RangeError('Cache lifetime must be a positive integer');
    }
  }

  get(key: Key, load: () => Promise<Value>, options: RequestCacheOptions = {}) {
    const now = Date.now();
    const cached = this.#values.get(key);
    if (cached && cached.expiresAt > now) {
      return Promise.resolve(cached.value);
    }

    const staleIfError = (request: Promise<Value>) =>
      options.staleIfError && cached ? request.catch(() => cached.value) : request;

    const cachedOrRequest = (request: Promise<Value>) => {
      if (!cached || !options.staleWhileRevalidate) {
        return staleIfError(request);
      }

      void request.catch(() => undefined);
      return Promise.resolve(cached.value);
    };

    const active = this.#requests.get(key);
    if (active) {
      return cachedOrRequest(active);
    }

    const request = Promise.resolve()
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
          expiresAt: completedAt + this.lifetime,
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

    return cachedOrRequest(request);
  }
}
