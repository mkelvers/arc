import { z } from 'zod';

import { AnimeCardSchema } from './types';

export interface SearchArtwork {
    group: string;
    backdrop: string | null;
}

export const AnimeSearchResultSchema = AnimeCardSchema.extend({
    titles: z.array(z.string()),
    format: z.string().nullable(),
    popularity: z.number(),
    backdrop: z.string().nullable(),
    artworkGroup: z.string().nullable(),
    relatedIds: z.array(z.number().int()),
});

export type AnimeSearchResult = z.infer<typeof AnimeSearchResultSchema>;

function searchTokens(value: string) {
    return (
        value
            .normalize('NFKD')
            .toLocaleLowerCase('en')
            .replace(/\p{M}/gu, '')
            .replace(/\bzero\b/gu, '0')
            .match(/[\p{L}\p{N}]+/gu) ?? []
    );
}

interface SearchPhrase {
    words: string[];
    phrase: string;
    compact: string;
    acronym: string;
}

function searchPhrase(value: string): SearchPhrase {
    const words = searchTokens(value);

    return {
        words,
        phrase: words.join(' '),
        compact: words.join(''),
        acronym: words.map((word) => word[0]).join(''),
    };
}

export function animeSearchText(titles: readonly string[]) {
    return [
        ...titles.map((title) => searchTokens(title).join(' ')),
        ...titles.map((title) =>
            searchTokens(title)
                .map((word) => word[0])
                .join('')
        ),
    ]
        .filter((value, index, values) => value.length >= 2 && values.indexOf(value) === index)
        .join('\n');
}

function editDistance(left: string, right: string) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            current[rightIndex] = Math.min(
                (current[rightIndex - 1] ?? 0) + 1,
                (previous[rightIndex] ?? 0) + 1,
                (previous[rightIndex - 1] ?? 0) +
                    (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
            );
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[right.length] ?? right.length;
}

function fuzzyDistance(query: string, candidate: string) {
    if (candidate.length <= query.length + 2) {
        return editDistance(query, candidate);
    }

    let distance = query.length;
    for (let length = Math.max(1, query.length - 1); length <= query.length + 1; length += 1) {
        for (let index = 0; index + length <= candidate.length; index += 1) {
            distance = Math.min(
                distance,
                editDistance(query, candidate.slice(index, index + length))
            );
        }
    }
    return distance;
}

function titleRelevance(query: SearchPhrase, title: string) {
    const candidate = searchPhrase(title);

    if (candidate.compact === query.compact && query.compact.length > 5) {
        return 1_000;
    }

    if (
        candidate.compact !== query.compact &&
        (candidate.phrase.startsWith(query.phrase) || candidate.compact.startsWith(query.compact))
    ) {
        return 880;
    }

    if (candidate.acronym === query.compact) {
        return 840;
    }

    if (query.words.length === 1 && candidate.words.includes(query.phrase)) {
        return 760;
    }

    if (candidate.phrase.includes(query.phrase) || candidate.compact.includes(query.compact)) {
        return 760 - Math.min(candidate.compact.indexOf(query.compact), 100);
    }

    if (query.compact.length < 4 || query.compact.length > 64) {
        return 0;
    }

    const distance = fuzzyDistance(query.compact, candidate.compact);
    const tolerance = query.compact.length < 7 ? 1 : 2;
    return distance <= tolerance ? 620 - distance * 60 : 0;
}

export function searchRelevance(query: string, titles: readonly string[]) {
    const phrase = searchPhrase(query);
    return phrase.compact
        ? Math.max(0, ...titles.map((title) => titleRelevance(phrase, title)))
        : 0;
}

export function rankAnimeSearch(query: string, results: AnimeSearchResult[]) {
    return results
        .map((result, index) => ({
            result,
            index,
            relevance: searchRelevance(query, result.titles),
        }))
        .sort(
            (left, right) =>
                right.relevance - left.relevance ||
                right.result.popularity - left.result.popularity ||
                left.index - right.index
        )
        .map(({ result }) => result);
}

export function distinctSearchArtwork(results: AnimeSearchResult[], limit: number) {
    const artwork = new Set<string>();
    const distinct: AnimeSearchResult[] = [];

    for (const result of results) {
        const image = result.artworkGroup ?? result.backdrop ?? result.image;
        if (artwork.has(image)) {
            continue;
        }

        artwork.add(image);
        distinct.push(result);
        if (distinct.length === limit) {
            break;
        }
    }

    return distinct;
}

export function inferSearchArtwork(
    results: AnimeSearchResult[],
    stored: ReadonlyMap<number, SearchArtwork>
) {
    const artwork = new Map(stored);
    const groupBackdrops = new Map<string, string>();
    for (const { group, backdrop } of stored.values()) {
        if (backdrop) {
            groupBackdrops.set(group, backdrop);
        }
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const result of results) {
            if (result.format === 'MOVIE' || artwork.has(result.id)) {
                continue;
            }

            const groups = new Set(
                result.relatedIds
                    .map((id) => artwork.get(id)?.group)
                    .filter((group): group is string => group?.startsWith('tmdb:tv:') === true)
            );
            if (groups.size !== 1) {
                continue;
            }

            const [group] = groups;
            artwork.set(result.id, { group, backdrop: groupBackdrops.get(group) ?? null });
            changed = true;
        }
    }

    return new Map(
        results.flatMap((result) => {
            const value = artwork.get(result.id);
            return value
                ? [
                      [
                          result.id,
                          { ...value, backdrop: groupBackdrops.get(value.group) ?? value.backdrop },
                      ] as const,
                  ]
                : [];
        })
    );
}
