const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const retryOffsets = [0, 5 * minute, 15 * minute, 30 * minute, hour, 3 * hour, 6 * hour, 12 * hour];

export function firstEpisodeAttemptAt(airingAt: Date) {
    return new Date(airingAt.getTime() - 30 * minute);
}

export function nextEpisodeAttemptAt(airingAt: Date, now: Date) {
    const deadline = airingAt.getTime() + 14 * day;
    if (now.getTime() >= deadline) {
        return null;
    }

    for (const offset of retryOffsets) {
        const attemptAt = airingAt.getTime() + offset;
        if (attemptAt > now.getTime()) {
            return new Date(attemptAt);
        }
    }

    const daysSinceAiring = Math.floor((now.getTime() - airingAt.getTime()) / day) + 1;
    const next = airingAt.getTime() + daysSinceAiring * day;
    return next <= deadline ? new Date(next) : null;
}
