import type { WatchlistState } from '$lib/server/db/schema';

const maximumEntries = 500;

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

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function positiveInteger(value: unknown) {
    return typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value > 0
        ? value
        : undefined;
}

function text(value: unknown) {
    return typeof value === 'string' && value.trim()
        ? value.trim()
        : undefined;
}

function date(value: unknown) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

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
    const nested = record(entry.titles);
    const directTitle = text(entry.title);

    if (!nested) {
        return directTitle ? { preferred: directTitle } : {};
    }

    return {
        preferred: text(nested.preferred) ?? directTitle,
        original: text(nested.original),
        english: text(nested.english),
        japanese: text(nested.japanese),
        romaji: text(nested.romaji),
        native: text(nested.native),
    };
}

export function parseWatchlistImport(source: string): WatchlistImportEntry[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(source);
    } catch {
        throw new WatchlistImportError('Choose a valid JSON watchlist file.');
    }

    const root = record(parsed);
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

    if (entries.length > maximumEntries) {
        throw new WatchlistImportError(
            `Watchlists can contain at most ${maximumEntries} entries.`,
        );
    }

    return entries.map((value, index) => {
        const entry = record(value);
        if (!entry) {
            throw new WatchlistImportError(
                `Entry ${index + 1} must be a JSON object.`,
            );
        }

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
        const addedAt = date(entry.added_at ?? entry.addedAt);
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
