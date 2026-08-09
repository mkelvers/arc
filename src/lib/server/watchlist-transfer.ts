import type { WatchlistState } from '$lib/watchlist';
import { isRecord, nonEmptyText, parseDate, positiveInteger } from '$lib/utils';

export interface WatchlistTransferTitles {
  preferred?: string;
  english?: string;
  romaji?: string;
  native?: string;
}

export interface WatchlistImportEntry {
  index: number;
  anilistId?: number;
  malId?: number;
  state: WatchlistState;
  addedAt?: Date;
  updatedAt?: Date;
  titles: WatchlistTransferTitles;
}

export class WatchlistImportError extends Error {}

export function importedActivityAt(index: number, importedAt: number) {
  return new Date(importedAt - index);
}

export function importedWatchlistState(value: unknown): WatchlistState | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'watching':
    case 'current':
    case 'repeating':
      return 'watching';
    case 'plan_to_watch':
    case 'planning':
    case 'planned':
    case 'on_hold':
    case 'paused':
      return 'plan_to_watch';
    case 'completed':
    case 'complete':
      return 'completed';
    case 'dropped':
      return 'dropped';
    default:
      return null;
  }
}

function titles(entry: Record<string, unknown>): WatchlistTransferTitles {
  const nested = isRecord(entry.titles) ? entry.titles : null;
  const direct = nonEmptyText(entry.title);

  if (!nested) {
    return direct ? { preferred: direct } : {};
  }

  return {
    preferred: nonEmptyText(nested.preferred) ?? direct,
    english: nonEmptyText(nested.english),
    romaji: nonEmptyText(nested.romaji ?? nested.original),
    native: nonEmptyText(nested.native ?? nested.japanese),
  };
}

export function parseWatchlistImport(source: string): WatchlistImportEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new WatchlistImportError('Choose a valid JSON watchlist file.');
  }

  const root = isRecord(parsed) ? parsed : null;
  const entries = Array.isArray(parsed)
    ? parsed
    : root && Array.isArray(root.entries)
      ? root.entries
      : null;

  if (!entries) {
    throw new WatchlistImportError('The JSON file must contain an entries array.');
  }

  return entries.map((value, index) => {
    if (!isRecord(value)) {
      throw new WatchlistImportError(`Entry ${index + 1} must be a JSON object.`);
    }

    const state = importedWatchlistState(value.status ?? value.state);
    if (!state) {
      throw new WatchlistImportError(`Entry ${index + 1} has an unsupported watchlist status.`);
    }

    const anilistId = positiveInteger(value.anilist_id ?? value.anilistId);
    const malId = positiveInteger(value.mal_id ?? value.malId);
    if (!anilistId && !malId) {
      throw new WatchlistImportError(`Entry ${index + 1} needs an AniList ID or MAL ID.`);
    }

    return {
      index,
      anilistId,
      malId,
      state,
      addedAt: parseDate(value.added_at ?? value.addedAt),
      updatedAt: parseDate(value.updated_at ?? value.updatedAt),
      titles: titles(value),
    };
  });
}
