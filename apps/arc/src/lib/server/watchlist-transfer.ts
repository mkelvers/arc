import { load } from 'cheerio';
import { z } from 'zod';

import type { WatchlistState } from '$lib/watchlist';
import {
    isRecord,
    JsonValueSchema,
    nonEmptyText,
    positiveInteger,
    type JsonObject,
    type JsonValue,
} from '$lib/utils';

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
    genericId?: number;
    state: WatchlistState;
    addedAt?: Date;
    activityAt?: Date;
    titles: WatchlistTransferTitles;
}

export class WatchlistImportError extends Error {}

const importDateNumberSchema = z.number().finite();
const importDateTextSchema = z.string().trim().min(1);
const unixTimestampTextSchema = importDateTextSchema.regex(/^\d{9,13}$/).transform(Number);

function dateFromUnixTimestamp(value: number) {
    const date = new Date(value < 1_000_000_000_000 ? value * 1_000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function importDate(value: JsonValue | undefined) {
    const number = importDateNumberSchema.safeParse(value);
    if (number.success) {
        return dateFromUnixTimestamp(number.data);
    }

    const timestamp = unixTimestampTextSchema.safeParse(value);
    if (timestamp.success) {
        return dateFromUnixTimestamp(timestamp.data);
    }

    const text = importDateTextSchema.safeParse(value);
    if (!text.success) {
        return undefined;
    }
    const date = new Date(text.data);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function importedActivityAt(index: number, importedAt: number, sourceActivityAt?: Date) {
    return sourceActivityAt ?? new Date(importedAt - index);
}

export function importedWatchlistState(value: JsonValue | undefined): WatchlistState | null {
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

function transferTitles(entry: JsonObject): WatchlistTransferTitles {
    const nested = isRecord(entry.titles) ? entry.titles : null;
    const direct = nonEmptyText(entry.title ?? entry.name ?? entry.anime_title);

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

function parsedEntry(entry: JsonObject, index: number, label: string) {
    const state = importedWatchlistState(entry.status ?? entry.watch_status ?? entry.state);
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

    return {
        index,
        anilistId,
        malId,
        genericId,
        state,
        addedAt,
        activityAt,
        titles,
    } satisfies WatchlistImportEntry;
}

export function parseJsonWatchlist(source: string): WatchlistImportEntry[] {
    let raw: unknown;

    try {
        raw = JSON.parse(source) as unknown;
    } catch {
        throw new WatchlistImportError('Choose a valid JSON, CSV, or XML watchlist file.');
    }

    const validated = JsonValueSchema.safeParse(raw);
    if (!validated.success) {
        throw new WatchlistImportError('Choose a valid JSON, CSV, or XML watchlist file.');
    }
    const parsed = validated.data;

    const root = isRecord(parsed) ? parsed : null;
    const entries = Array.isArray(parsed)
        ? parsed
        : root && Array.isArray(root.entries)
          ? root.entries
          : root && Array.isArray(root.anime)
            ? root.anime
            : null;

    if (!entries?.length) {
        throw new WatchlistImportError('The JSON file must contain at least one watchlist entry.');
    }

    return entries.map((value, index) => {
        if (!isRecord(value)) {
            throw new WatchlistImportError(`Entry ${index + 1} must be a JSON object.`);
        }
        return parsedEntry(value, index, `Entry ${index + 1}`);
    });
}

function parseCsvRows(source: string) {
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

export function parseCsvWatchlist(source: string): WatchlistImportEntry[] {
    const rows = parseCsvRows(source);
    const headers = rows.shift()?.map(normalizedHeader);
    if (!headers?.length || !rows.length) {
        throw new WatchlistImportError(
            'The CSV file must contain a header and at least one entry.'
        );
    }

    return rows.map((row, index) => {
        const record: JsonObject = Object.fromEntries(
            headers.map((header, column) => [header, row[column] ?? ''])
        );
        return parsedEntry(record, index, `CSV row ${index + 2}`);
    });
}

export function parseXmlWatchlist(source: string): WatchlistImportEntry[] {
    const document = load(source, { xmlMode: true });
    const nodes = document('anime, entry, item').toArray();
    if (!nodes.length) {
        throw new WatchlistImportError('The XML file contains no anime entries.');
    }

    return nodes.map((node, index) => {
        const element = document(node);
        const field = (...names: string[]) => {
            for (const name of names) {
                const value = element.attr(name) ?? element.find(name).first().text();
                if (value.trim()) {
                    return value.trim();
                }
            }
            return undefined;
        };

        const record: JsonObject = {};
        const values = {
            anilist_id: field('anilist_id', 'anilistId'),
            mal_id: field('mal_id', 'malId', 'series_animedb_id'),
            id: field('id', 'anime_id'),
            title: field('title', 'anime_title', 'series_title', 'name'),
            status: field('status', 'watch_status', 'state', 'my_status'),
            added_at: field('added_at', 'addedAt', 'created_at', 'createdAt', 'my_start_date'),
            updated_at: field(
                'updated_at',
                'updatedAt',
                'last_updated',
                'lastUpdated',
                'my_last_updated'
            ),
        };
        for (const [name, value] of Object.entries(values)) {
            if (value !== undefined) {
                record[name] = value;
            }
        }

        return parsedEntry(record, index, `XML entry ${index + 1}`);
    });
}

export function parseWatchlistImport(source: string, filename = '') {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'json') {
        return parseJsonWatchlist(source);
    }
    if (extension === 'csv') {
        return parseCsvWatchlist(source);
    }
    if (extension === 'xml') {
        return parseXmlWatchlist(source);
    }

    const trimmed = source.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return parseJsonWatchlist(source);
    }
    if (trimmed.startsWith('<')) {
        return parseXmlWatchlist(source);
    }
    return parseCsvWatchlist(source);
}
