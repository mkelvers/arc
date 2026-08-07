import { isRecord } from '$lib/utils';

export interface PlaybackProgressInput {
  animeId: number;
  episodeId: string;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parsePlaybackProgress(value: unknown): PlaybackProgressInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const animeId = finiteNumber(value.animeId);
  const episodeNumber = finiteNumber(value.episodeNumber);
  const positionSeconds = finiteNumber(value.positionSeconds);
  const durationSeconds = finiteNumber(value.durationSeconds);
  const episodeId = typeof value.episodeId === 'string' ? value.episodeId.trim() : '';

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
    typeof value.completed !== 'boolean'
  ) {
    return null;
  }

  return {
    animeId,
    episodeId,
    episodeNumber,
    positionSeconds: Math.min(positionSeconds, durationSeconds),
    durationSeconds,
    completed: value.completed,
  };
}
