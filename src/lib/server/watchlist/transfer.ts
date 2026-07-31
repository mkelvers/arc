import type { WatchlistState } from '$lib/server/db/schema';
import {
    isRecord,
    nonEmptyText,
    parseDate,
    positiveInteger,
} from '$lib/utils';

export interface WatchlistTransferTitles {
    preferred?: string;
    original?: string;
    english?: string;
    japanese?: string;
    romaji?: string;
    native?: string;
}

export interface WatchlistImportEntry {
    index: number;
    anilistId?: number;
    malId?: number;
    addedAt?: Date;
    state: WatchlistState;
    titles: WatchlistTransferTitles;
}

export class WatchlistImportError extends Error {}

function state(value: unknown): WatchlistState | null {
    if (typeof value !== 'string') {
        return null;
    }

    switch (value.trim().toLowerCase()) {
        case 'watching':
        case 'current':
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
    const directTitle = nonEmptyText(entry.title);

    if (!nested) {
        return directTitle ? { preferred: directTitle } : {};
    }

    return {
        preferred: nonEmptyText(nested.preferred) ?? directTitle,
        original: nonEmptyText(nested.original),
        english: nonEmptyText(nested.english),
        japanese: nonEmptyText(nested.japanese),
        romaji: nonEmptyText(nested.romaji),
        native: nonEmptyText(nested.native),
    };
}

export function parseWatchlistImport(source: string): WatchlistImportEntry[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(source);
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
        throw new WatchlistImportError(
            'The JSON file must contain an entries array.',
        );
    }

    return entries.map((value, index) => {
        if (!isRecord(value)) {
            throw new WatchlistImportError(
                `Entry ${index + 1} must be a JSON object.`,
            );
        }
        const entry = value;

        const entryState = state(entry.status ?? entry.state);
        if (!entryState) {
            throw new WatchlistImportError(
                `Entry ${index + 1} has an unsupported watchlist status.`,
            );
        }

        const anilistId = positiveInteger(
            entry.anilist_id ?? entry.anilistId,
        );
        const malId = positiveInteger(entry.mal_id ?? entry.malId);
        const addedAt = parseDate(entry.added_at ?? entry.addedAt);
        const entryTitles = titles(entry);

        if (
            !anilistId &&
            !malId &&
            !Object.values(entryTitles).some(Boolean)
        ) {
            throw new WatchlistImportError(
                `Entry ${index + 1} needs an AniList ID, MAL ID, or title.`,
            );
        }

        return {
            index,
            anilistId,
            malId,
            addedAt,
            state: entryState,
            titles: entryTitles,
        };
    });
}
