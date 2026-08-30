const minute = 60_000;
const day = 24 * 60 * minute;

export const schedulerRunLease = {
    durationMs: 2 * minute,
    renewalMs: 30_000,
} as const;

export function firstEpisodeAttemptAt(airingAt: Date) {
    return new Date(airingAt.getTime() - 30 * minute);
}

export function nextEpisodeAttemptAt(airingAt: Date, now: Date) {
    const deadline = airingAt.getTime() + 14 * day;
    const nextAttemptAt = now.getTime() + minute;
    if (nextAttemptAt > deadline) {
        return null;
    }

    return new Date(nextAttemptAt);
}
