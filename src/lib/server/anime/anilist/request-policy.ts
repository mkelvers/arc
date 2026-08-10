import { GraphQLRequestError } from '$lib/server/graphql';

const unavailableRetryDelay = 30_000;
const defaultRateLimitRetryDelay = 60_000;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class AniListRequestPolicy {
  #blockedUntil = 0;
  #nextStartAt = 0;
  #schedule = Promise.resolve();

  constructor(readonly minimumIntervalMs: number) {
    if (!Number.isSafeInteger(minimumIntervalMs) || minimumIntervalMs < 0) {
      throw new RangeError('AniList request interval must be a non-negative integer');
    }
  }

  async run<Value>(load: () => Promise<Value>) {
    const turn = this.#schedule.then(async () => {
      const wait = this.#nextStartAt - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }

      if (this.#blockedUntil > Date.now()) {
        throw new GraphQLRequestError({
          message: 'AniList requests are temporarily paused after an upstream failure',
          status: 429,
          retryAfterMs: this.#blockedUntil - Date.now(),
        });
      }

      this.#nextStartAt = Date.now() + this.minimumIntervalMs;
    });
    this.#schedule = turn.catch(() => undefined);
    await turn;

    try {
      return await load();
    } catch (cause) {
      if (cause instanceof GraphQLRequestError) {
        const delay =
          cause.status === 429
            ? (cause.retryAfterMs ?? defaultRateLimitRetryDelay)
            : cause.status == null || cause.status >= 500
              ? unavailableRetryDelay
              : 0;

        if (delay > 0) {
          this.#blockedUntil = Math.max(this.#blockedUntil, Date.now() + delay);
        }
      }

      throw cause;
    }
  }
}

// All AniList operations share the provider's process-wide rate budget.
export const anilistRequestPolicy = new AniListRequestPolicy(2_100);
