import { Effect } from 'effect';

import { TypedDocumentString } from '$lib/graphql/anilist/generated/graphql';
import type {
    WatchlistImportEntry,
    WatchlistTransferTitles,
} from '$lib/server/watchlist/transfer';
import { chunks } from '$lib/utils';
import { request } from './client';

const pageSize = 50;
const aliasesPerRequest = 20;
const mediaSelection = `
    id
    idMal
    title {
        english
        romaji
        native
    }
`;

export interface TransferAnime {
    id: number;
    idMal: number | null;
    title: {
        english: string | null;
        romaji: string | null;
        native: string | null;
    } | null;
}

interface TransferPage {
    media: Array<TransferAnime | null> | null;
}

interface BulkVariables {
    [key: string]: number[];
}

interface TitleVariables {
    [key: string]: string;
}

async function requestByIds(anilistIds: number[], malIds: number[]) {
    const groups = [
        ...chunks(anilistIds, pageSize).map((ids, index) => ({
            alias: `anilist${index}`,
            variable: `anilistIds${index}`,
            filter: 'id_in',
            ids,
        })),
        ...chunks(malIds, pageSize).map((ids, index) => ({
            alias: `mal${index}`,
            variable: `malIds${index}`,
            filter: 'idMal_in',
            ids,
        })),
    ];

    if (!groups.length) {
        return [];
    }

    const media: TransferAnime[] = [];

    for (const batch of chunks(groups, aliasesPerRequest)) {
        const definitions = batch
            .map(({ variable }) => `$${variable}: [Int!]!`)
            .join(', ');
        const fields = batch
            .map(
                ({ alias, variable, filter }) => `
                    ${alias}: Page(page: 1, perPage: ${pageSize}) {
                        media(${filter}: $${variable}, type: ANIME) {
                            ${mediaSelection}
                        }
                    }
                `,
            )
            .join('\n');
        const variables = Object.fromEntries(
            batch.map(({ variable, ids }) => [variable, ids]),
        );
        const document = new TypedDocumentString<
            Record<string, TransferPage | null>,
            BulkVariables
        >(`query WatchlistTransfer(${definitions}) { ${fields} }`);
        const response = await Effect.runPromise(
            request(document, variables),
        );

        media.push(
            ...Object.values(response).flatMap((page) =>
                (page?.media ?? []).filter(
                    (entry): entry is TransferAnime => entry !== null,
                ),
            ),
        );
    }

    return media;
}

function normalized(value: string) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function titleValues(titles: WatchlistTransferTitles) {
    return [
        titles.preferred,
        titles.english,
        titles.original,
        titles.romaji,
        titles.japanese,
        titles.native,
    ].filter((value): value is string => Boolean(value));
}

function mediaTitles(media: TransferAnime) {
    return [
        media.title?.english,
        media.title?.romaji,
        media.title?.native,
    ].filter((value): value is string => Boolean(value));
}

async function requestByTitles(entries: WatchlistImportEntry[]) {
    const searchable = entries.flatMap((entry, index) => {
        const title = titleValues(entry.titles)[0];
        return title
            ? [{ alias: `title${index}`, variable: `search${index}`, title, entry }]
            : [];
    });

    if (!searchable.length) {
        return new Map<number, TransferAnime>();
    }

    const matched = new Map<number, TransferAnime>();

    for (const batch of chunks(searchable, aliasesPerRequest)) {
        const definitions = batch
            .map(({ variable }) => `$${variable}: String!`)
            .join(', ');
        const fields = batch
            .map(
                ({ alias, variable }) => `
                    ${alias}: Page(page: 1, perPage: 1) {
                        media(search: $${variable}, type: ANIME) {
                            ${mediaSelection}
                        }
                    }
                `,
            )
            .join('\n');
        const variables = Object.fromEntries(
            batch.map(({ variable, title }) => [variable, title]),
        );
        const document = new TypedDocumentString<
            Record<string, TransferPage | null>,
            TitleVariables
        >(`query WatchlistTitleTransfer(${definitions}) { ${fields} }`);
        const response = await Effect.runPromise(
            request(document, variables),
        );

        batch.forEach(({ alias, entry }) => {
            const media = response[alias]?.media?.[0];
            if (!media) {
                return;
            }

            const expected = new Set(
                titleValues(entry.titles).map(normalized),
            );
            if (
                mediaTitles(media).some((title) =>
                    expected.has(normalized(title)),
                )
            ) {
                matched.set(entry.index, media);
            }
        });
    }

    return matched;
}

export async function resolveWatchlistImport(entries: WatchlistImportEntry[]) {
    const media = await requestByIds(
        [...new Set(entries.flatMap(({ anilistId }) => anilistId ? [anilistId] : []))],
        [...new Set(entries.flatMap(({ malId }) => malId ? [malId] : []))],
    );
    const byAniListId = new Map(media.map((entry) => [entry.id, entry]));
    const byMalId = new Map(
        media.flatMap((entry) =>
            entry.idMal ? [[entry.idMal, entry] as const] : [],
        ),
    );
    const resolved = new Map<number, TransferAnime>();

    for (const entry of entries) {
        const match =
            (entry.anilistId && byAniListId.get(entry.anilistId)) ||
            (entry.malId && byMalId.get(entry.malId));
        if (match) {
            resolved.set(entry.index, match);
        }
    }

    const unresolved = entries.filter((entry) => !resolved.has(entry.index));
    const titleMatches = await requestByTitles(unresolved);
    for (const [index, match] of titleMatches) {
        resolved.set(index, match);
    }

    return resolved;
}

export async function getWatchlistTransferAnime(anilistIds: number[]) {
    return requestByIds([...new Set(anilistIds)], []);
}
