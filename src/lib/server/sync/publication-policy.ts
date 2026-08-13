export function publicationRetryDelay(attempts: number, retryAfterMs?: number) {
    if (retryAfterMs !== undefined) {
        return Math.max(1_000, retryAfterMs);
    }

    return Math.min(30 * 60 * 1_000, 60_000 * 2 ** Math.min(attempts, 5));
}
