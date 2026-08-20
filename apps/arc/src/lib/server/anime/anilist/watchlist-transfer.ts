import {
    SearchAnimePageDocument,
    WatchlistTransferAnimeDocument,
} from '$lib/graphql/anilist/generated/graphql';
import { WatchlistImportError, type WatchlistImportEntry } from '$lib/server/watchlist-transfer';
import { batches } from '$lib/utils';
import { request } from './client';
import { animeTitles, present } from './text';

interface WatchlistTransferAnime {
    id: number;
    idMal: number | null;
    title: {
        english: string | null;
        romaji: string | null;
        native: string | null;
    } | null;
}

const maximumTitleLookups = 50;

function titles(media: WatchlistTransferAnime) {
    return [media.title?.english, media.title?.romaji, media.title?.native].filter(
        (title): title is string => Boolean(title?.trim())
    );
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

async function getWatchlistTransferAnimeByMalId(malIds: number[]) {
    const malBatches = batches([...new Set(malIds)], 50);
    const media: WatchlistTransferAnime[] = [];

    for (const malIdBatch of malBatches) {
        const response = await request(WatchlistTransferAnimeDocument, {
            anilistIds: [],
            malIds: malIdBatch,
        });
        media.push(...present(response.anilist?.media), ...present(response.mal?.media));
    }

    return [...new Map(media.map((entry) => [entry.id, entry])).values()];
}

async function searchTitle(title: string) {
    const response = await request(SearchAnimePageDocument, {
        search: title,
        page: 1,
        perPage: 50,
    });

    return present(response.Page?.media).map((media) => ({
        id: media.id,
        title: media.title?.english ?? media.title?.romaji ?? media.title?.native ?? null,
        titles: animeTitles(media),
    }));
}

function uniqueMatch(candidates: WatchlistTransferAnime[], importedTitles: string[]) {
    const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
    if (unique.length === 1) {
        return unique[0];
    }
    if (!importedTitles.length) {
        return undefined;
    }

    const exact = unique.filter((candidate) =>
        importedTitles.some((title) => titleMatches(title, titles(candidate)))
    );
    return exact.length === 1 ? exact[0] : undefined;
}

export async function resolveWatchlistImport(entries: WatchlistImportEntry[]) {
    const media = await getWatchlistTransferAnimeByMalId(
        entries.flatMap(({ anilistId, genericId, malId }) =>
            !anilistId && !genericId && malId ? [malId] : []
        )
    );
    const byMalId = new Map(
        media.flatMap((entry) => (entry.idMal ? ([[entry.idMal, entry]] as const) : []))
    );
    const resolved = new Map<number, WatchlistTransferAnime>();

    for (const entry of entries) {
        const directId = entry.anilistId ?? entry.genericId;
        if (directId) {
            resolved.set(entry.index, { id: directId, idMal: entry.malId ?? null, title: null });
            continue;
        }

        const importedTitles = Object.values(entry.titles).filter((title): title is string =>
            Boolean(title)
        );
        const malMatch = entry.malId ? byMalId.get(entry.malId) : undefined;
        const match = uniqueMatch(malMatch ? [malMatch] : [], importedTitles);
        if (match) {
            resolved.set(entry.index, match);
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
            `More than ${maximumTitleLookups} entries need title matching. Add AniList or MAL IDs to the file and try again.`
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
            resolved.set(entry.index, {
                id: match.id,
                idMal: null,
                title: { english: match.title, romaji: null, native: null },
            });
        }
    }

    return resolved;
}
