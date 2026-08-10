import type { WatchlistState } from '$lib/watchlist';
import { load } from 'cheerio';
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

export function parseMyAnimeListXml(source: string): WatchlistImportEntry[] {
  const document = load(source, { xmlMode: true });
  const entries: WatchlistImportEntry[] = [];

  document('anime').each((index, anime) => {
    const field = (name: string) => document(anime).find(name).first().text().trim();
    const state = importedWatchlistState(field('my_status'));
    const malId = positiveInteger(field('series_animedb_id'));

    if (!state || !malId) {
      return;
    }

    entries.push({
      index,
      malId,
      state,
      addedAt: parseDate(field('my_start_date')),
      updatedAt: parseDate(field('my_finish_date')),
      titles: { preferred: nonEmptyText(field('series_title')) },
    });
  });

  if (!entries.length) {
    throw new WatchlistImportError('The XML file contains no supported anime entries.');
  }

  return entries;
}

export function parseUniversalCsv(source: string): WatchlistImportEntry[] {
  const rows = source
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(',').map((value) => value.trim().replace(/^"|"$/g, '')));
  const headers = rows.shift()?.map((header) => header.toLowerCase().replaceAll(' ', '_'));

  if (!headers?.length || !rows.length) {
    throw new WatchlistImportError('The CSV file contains no supported anime entries.');
  }

  return rows.flatMap((row, index) => {
    const record = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
    const state = importedWatchlistState(record.status ?? record.watch_status ?? record.state);
    const anilistId = positiveInteger(record.anilist_id ?? record.anilistid);
    const malId = positiveInteger(record.mal_id ?? record.malid);

    if (!state || (!anilistId && !malId)) {
      return [];
    }

    return [
      {
        index,
        anilistId: anilistId ?? undefined,
        malId: malId ?? undefined,
        state,
        titles: { preferred: nonEmptyText(record.title) },
      },
    ];
  });
}
