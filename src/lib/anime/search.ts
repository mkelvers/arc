import { z } from 'zod';

import { AnimeCardSchema } from './types';

export interface SearchArtwork {
  group: string;
  backdrop: string | null;
}

const AnimeSearchResultSchema = AnimeCardSchema.extend({
  titles: z.array(z.string()),
  format: z.string().nullable(),
  popularity: z.number().finite(),
  backdrop: z.string().nullable(),
  artworkGroup: z.string().nullable(),
  relatedIds: z.array(z.number().int()),
});

export type AnimeSearchResult = z.infer<typeof AnimeSearchResultSchema>;

const AnimeSearchResultsSchema = z.array(AnimeSearchResultSchema);

export function isAnimeSearchResults(value: unknown): value is AnimeSearchResult[] {
  return AnimeSearchResultsSchema.safeParse(value).success;
}

function searchTokens(value: string) {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en')
    .replace(/\p{M}/gu, '')
    .replace(/\bzero\b/gu, '0')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
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
      distance = Math.min(distance, editDistance(query, candidate.slice(index, index + length)));
    }
  }
  return distance;
}

export function searchRelevance(query: string, titles: readonly string[]) {
  const queryWords = searchTokens(query);
  const compactQuery = queryWords.join('');
  if (!compactQuery) {
    return 0;
  }

  return Math.max(
    0,
    ...titles.map((title) => {
      const titleWords = searchTokens(title);
      const compactTitle = titleWords.join('');
      const phrase = titleWords.join(' ');
      const queryPhrase = queryWords.join(' ');

      if (compactTitle === compactQuery && compactQuery.length > 5) {
        return 1_000;
      }

      if (
        compactTitle !== compactQuery &&
        (phrase.startsWith(queryPhrase) || compactTitle.startsWith(compactQuery))
      ) {
        return 880;
      }

      if (titleWords.map((word) => word[0]).join('') === compactQuery) {
        return 840;
      }

      if (queryWords.length === 1 && titleWords.includes(queryPhrase)) {
        return 760;
      }

      if (phrase.includes(queryPhrase) || compactTitle.includes(compactQuery)) {
        return 760 - Math.min(compactTitle.indexOf(compactQuery), 100);
      }

      if (compactQuery.length < 4 || compactQuery.length > 64) {
        return 0;
      }

      const distance = fuzzyDistance(compactQuery, compactTitle);
      const tolerance = compactQuery.length < 7 ? 1 : 2;
      return distance <= tolerance ? 620 - distance * 60 : 0;
    })
  );
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
