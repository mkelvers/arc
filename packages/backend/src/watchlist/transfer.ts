import { z } from 'zod';

import {
    SearchAnimePageDocument,
    WatchlistTransferAnimeDocument,
} from '@arc/shared/graphql/generated/graphql';
import type { WatchlistState } from '@arc/shared/db/schema';
import { batches, positiveInteger, record, text, type JsonValue } from '../utils';
import { animeTitles } from '@arc/core/catalog/anilist-text';

interface TransferTitles {
    preferred?: string;
    english?: string;
    romaji?: string;
    native?: string;
}

interface ImportEntry {
    index: number;
    anilistId?: number;
    malId?: number;
    genericId?: number;
    state: WatchlistState;
    addedAt?: Date;
    activityAt?: Date;
    titles: TransferTitles;
}

interface TransferAnime {
    id: number;
    idMal: number | null;
    title: {
        english: string | null;
        romaji: string | null;
        native: string | null;
    } | null;
}

export class WatchlistImportError extends Error {}

const dateNumberSchema = z.number().finite();
const dateTextSchema = z.string().trim().min(1);
const unixTimestampSchema = dateTextSchema.regex(/^\d{9,13}$/).transform(Number);
const maximumTitleLookups = 50;

function dateFromTimestamp(value: number) {
    const date = new Date(value < 1_000_000_000_000 ? value * 1_000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function importDate(value: JsonValue | undefined) {
    const number = dateNumberSchema.safeParse(value);
    if (number.success) {
        return dateFromTimestamp(number.data);
    }

    const timestamp = unixTimestampSchema.safeParse(value);
    if (timestamp.success) {
        return dateFromTimestamp(timestamp.data);
    }

    const parsed = dateTextSchema.safeParse(value);
    if (!parsed.success) {
        return undefined;
    }
    const date = new Date(parsed.data);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function importedActivityAt(index: number, importedAt: number, source?: Date) {
    return source ?? new Date(importedAt - index);
}

function importedState(value: JsonValue | undefined): WatchlistState | null {
    const parsed = z.string().trim().safeParse(value);
    if (!parsed.success) {
        return null;
    }

    switch (parsed.data.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')) {
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

function transferTitles(entry: Record<string, JsonValue>): TransferTitles {
    const nested = record(entry.titles);
    const direct = text(entry.title ?? entry.name ?? entry.anime_title);

    if (!nested) {
        return direct ? { preferred: direct } : {};
    }

    return {
        preferred: text(nested.preferred) ?? direct,
        english: text(nested.english),
        romaji: text(nested.romaji ?? nested.original),
        native: text(nested.native ?? nested.japanese),
    };
}

function parsedEntry(entry: Record<string, JsonValue>, index: number, label: string): ImportEntry {
    const state = importedState(entry.status ?? entry.watch_status ?? entry.state);
    if (!state) {
        throw new WatchlistImportError(`${label} has an unsupported watchlist status.`);
    }

    const anilistId = positiveInteger(entry.anilist_id ?? entry.anilistId);
    const malId = positiveInteger(entry.mal_id ?? entry.malId ?? entry.series_animedb_id);
    const genericId = positiveInteger(entry.id ?? entry.anime_id);
    const titles = transferTitles(entry);
    if (!anilistId && !malId && !genericId && !Object.values(titles).some(Boolean)) {
        throw new WatchlistImportError(`${label} needs an ID or title.`);
    }

    const addedAt = importDate(
        entry.added_at ?? entry.addedAt ?? entry.created_at ?? entry.createdAt
    );
    const activityAt =
        importDate(
            entry.updated_at ??
                entry.updatedAt ??
                entry.last_updated ??
                entry.lastUpdated ??
                entry.my_last_updated
        ) ?? addedAt;

    return { index, anilistId, malId, genericId, state, addedAt, activityAt, titles };
}

export function parseJsonWatchlist(source: string): ImportEntry[] {
    let raw: unknown;
    try {
        raw = JSON.parse(source) as unknown;
    } catch {
        throw new WatchlistImportError('Choose a valid JSON or CSV watchlist file.');
    }

    const parsed = z.json().safeParse(raw);
    if (!parsed.success) {
        throw new WatchlistImportError('Choose a valid JSON or CSV watchlist file.');
    }

    const root = record(parsed.data);
    const entries = Array.isArray(parsed.data)
        ? parsed.data
        : root && Array.isArray(root.entries)
          ? root.entries
          : root && Array.isArray(root.anime)
            ? root.anime
            : null;
    if (!entries?.length) {
        throw new WatchlistImportError('The JSON file must contain at least one watchlist entry.');
    }

    return entries.map((value, index) => {
        const entry = record(value);
        if (!entry) {
            throw new WatchlistImportError(`Entry ${index + 1} must be a JSON object.`);
        }
        return parsedEntry(entry, index, `Entry ${index + 1}`);
    });
}

function csvRows(source: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (character === '"') {
            if (quoted && source[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            row.push(value.trim());
            value = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && source[index + 1] === '\n') {
                index += 1;
            }
            row.push(value.trim());
            if (row.some(Boolean)) {
                rows.push(row);
            }
            row = [];
            value = '';
        } else {
            value += character;
        }
    }

    if (quoted) {
        throw new WatchlistImportError('The CSV file contains an unfinished quoted value.');
    }
    row.push(value.trim());
    if (row.some(Boolean)) {
        rows.push(row);
    }
    return rows;
}

function normalizedHeader(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '_')
        .replaceAll(/^_|_$/g, '');
}

export function parseCsvWatchlist(source: string): ImportEntry[] {
    const rows = csvRows(source);
    const headers = rows.shift()?.map(normalizedHeader);
    if (!headers?.length || !rows.length) {
        throw new WatchlistImportError(
            'The CSV file must contain a header and at least one entry.'
        );
    }

    return rows.map((row, index) =>
        parsedEntry(
            Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
            index,
            `CSV row ${index + 2}`
        )
    );
}

export function parseWatchlistImport(source: string, filename = '') {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'json') {
        return parseJsonWatchlist(source);
    }
    if (extension === 'csv') {
        return parseCsvWatchlist(source);
    }
    if (extension) {
        throw new WatchlistImportError('Choose a JSON or CSV watchlist file.');
    }

    const trimmed = source.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return parseJsonWatchlist(source);
    }
    return parseCsvWatchlist(source);
}

function normalizedTitle(value: string) {
    return value
        .normalize('NFKD')
        .toLocaleLowerCase('en')
        .replaceAll(/\p{M}/gu, '')
        .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function titleMatches(imported: string, candidates: string[]) {
    const normalized = normalizedTitle(imported);
    return Boolean(normalized) && candidates.some((title) => normalizedTitle(title) === normalized);
}

function titles(media: TransferAnime) {
    return [media.title?.english, media.title?.romaji, media.title?.native].filter(
        (title): title is string => Boolean(title?.trim())
    );
}

async function mediaByMalId(malIds: number[]) {
    if (!malIds.length) {
        return [];
    }

    const { request } = await import('../anime/anilist/client');
    const media: TransferAnime[] = [];
    for (const ids of batches([...new Set(malIds)], 50)) {
        const response = await request(WatchlistTransferAnimeDocument, {
            malIds: ids,
        });
        media.push(...(response.mal?.media?.filter((value) => value !== null) ?? []));
    }
    return [...new Map(media.map((entry) => [entry.id, entry])).values()];
}

async function searchTitle(title: string) {
    const { request } = await import('../anime/anilist/client');
    const response = await request(SearchAnimePageDocument, {
        search: title,
        page: 1,
        perPage: 50,
    });
    return (response.Page?.media?.filter((value) => value !== null) ?? []).map((media) => ({
        id: media.id,
        title: media.title?.english ?? media.title?.romaji ?? media.title?.native ?? null,
        titles: animeTitles(media),
    }));
}

async function resolveImport(entries: ImportEntry[]) {
    const media = await mediaByMalId(
        entries.flatMap(({ anilistId, genericId, malId }) =>
            !anilistId && !genericId && malId ? [malId] : []
        )
    );
    const byMalId = new Map(
        media.flatMap((entry) => (entry.idMal ? ([[entry.idMal, entry]] as const) : []))
    );
    const resolved = new Map<number, { id: number; title: string | null }>();

    for (const entry of entries) {
        const directId = entry.anilistId ?? entry.genericId;
        if (directId) {
            resolved.set(entry.index, {
                id: directId,
                title: Object.values(entry.titles).find(Boolean) ?? null,
            });
            continue;
        }

        const importedTitles = Object.values(entry.titles).filter((title): title is string =>
            Boolean(title)
        );
        const match = entry.malId ? byMalId.get(entry.malId) : undefined;
        if (match) {
            resolved.set(entry.index, {
                id: match.id,
                title: titles(match)[0] ?? importedTitles[0] ?? null,
            });
        }
    }

    const titleQueries = new Map(
        entries.flatMap((entry) => {
            if (resolved.has(entry.index)) {
                return [];
            }
            const title = Object.values(entry.titles).find(Boolean);
            return title ? [[title.toLocaleLowerCase('en'), title] as const] : [];
        })
    );
    if (titleQueries.size > maximumTitleLookups) {
        throw new WatchlistImportError(
            `More than ${maximumTitleLookups} entries need title matching. Add AniList or MAL IDs and try again.`
        );
    }

    const searchResults = new Map<string, Awaited<ReturnType<typeof searchTitle>>>();
    for (const batch of batches([...titleQueries], 4)) {
        const results = await Promise.all(batch.map(([, title]) => searchTitle(title)));
        batch.forEach(([key], index) => searchResults.set(key, results[index]));
    }

    for (const entry of entries) {
        if (resolved.has(entry.index)) {
            continue;
        }
        const matches = new Map<number, Awaited<ReturnType<typeof searchTitle>>[number]>();
        for (const title of Object.values(entry.titles).filter((value): value is string =>
            Boolean(value)
        )) {
            for (const result of searchResults.get(title.toLocaleLowerCase('en')) ?? []) {
                if (titleMatches(title, result.titles)) {
                    matches.set(result.id, result);
                }
            }
        }
        if (matches.size === 1) {
            const [match] = matches.values();
            resolved.set(entry.index, { id: match.id, title: match.title });
        }
    }
    return resolved;
}

export async function importedWatchlistEntries(source: string, filename: string) {
    const imported = parseWatchlistImport(source, filename);
    const resolved = await resolveImport(imported);
    const importedAt = Date.now();
    const entries = imported.flatMap((entry) => {
        const match = resolved.get(entry.index);
        const activityAt = importedActivityAt(entry.index, importedAt, entry.activityAt);
        return match
            ? [
                  {
                      anilistId: match.id,
                      title: match.title,
                      state: entry.state,
                      addedAt: entry.addedAt ?? activityAt,
                      updatedAt: activityAt,
                  },
              ]
            : [];
    });
    const seen = new Set<number>();
    for (const { anilistId } of entries) {
        if (seen.has(anilistId)) {
            throw new WatchlistImportError('The file contains the same anime more than once.');
        }
        seen.add(anilistId);
    }
    return { entries, unmatched: imported.length - entries.length };
}
