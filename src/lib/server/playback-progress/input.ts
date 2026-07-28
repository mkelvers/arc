export interface PlaybackProgressInput {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
}

function finiteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : null;
}

export function parsePlaybackProgress(
    value: unknown,
): PlaybackProgressInput | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const input = value as Record<string, unknown>;
    const animeId = finiteNumber(input.animeId);
    const episodeNumber = finiteNumber(input.episodeNumber);
    const positionSeconds = finiteNumber(input.positionSeconds);
    const durationSeconds = finiteNumber(input.durationSeconds);
    const episodeId =
        typeof input.episodeId === 'string' ? input.episodeId.trim() : '';

    if (
        animeId === null ||
        !Number.isSafeInteger(animeId) ||
        animeId <= 0 ||
        episodeNumber === null ||
        Math.abs(episodeNumber) > 1_000_000 ||
        positionSeconds === null ||
        positionSeconds < 0 ||
        durationSeconds === null ||
        durationSeconds <= 0 ||
        durationSeconds > 7 * 24 * 60 * 60 ||
        !episodeId ||
        episodeId.length > 512 ||
        typeof input.completed !== 'boolean'
    ) {
        return null;
    }

    return {
        animeId,
        episodeId,
        episodeNumber,
        positionSeconds: Math.min(positionSeconds, durationSeconds),
        durationSeconds,
        completed: input.completed,
    };
}
