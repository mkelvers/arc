import { Effect } from 'effect';

import type { BrowseFilters } from '$lib/anime/browse';
import {
  BrowseAnimePageDocument,
  BrowseAnimeTaxonomyDocument,
  type MediaFormat,
  type MediaSort,
  type MediaStatus,
} from '$lib/graphql/anilist/generated/graphql';
import { GraphQLRequestError } from '$lib/server/graphql';
import { request } from './client';
import { mediaTitle, plainText, present } from './text';

export interface AniListBrowseFilters extends Omit<BrowseFilters, 'format' | 'status'> {
  format: MediaFormat | null;
  status: MediaStatus | null;
}

export interface BrowseSourceTaxonomy {
  genres: string[];
  tags: string[];
  formats: string[];
  statuses: string[];
}

export interface BrowseCatalogEntry {
  anilistId: number;
  title: string;
  searchText: string;
  imageUrl: string;
  synopsis: string;
  genres: string[];
  tags: string[];
  format: MediaFormat | null;
  status: MediaStatus | null;
  isAdult: boolean;
  popularity: number | null;
  averageScore: number | null;
}

export function browseMediaSort(filters: Pick<BrowseFilters, 'sort' | 'order'>): MediaSort {
  const sort = filters.sort === 'score' ? 'SCORE' : 'POPULARITY';
  return filters.order === 'desc' ? `${sort}_DESC` : sort;
}

async function requestBrowsePage(filters: AniListBrowseFilters, page: number, perPage: number) {
  const response = await Effect.runPromise(
    request(BrowseAnimePageDocument, {
      search: filters.query || undefined,
      genre: filters.genre ?? undefined,
      tag: filters.tag ?? undefined,
      format: filters.format ?? undefined,
      status: filters.status ?? undefined,
      isAdult: filters.safe ? false : undefined,
      sort: [browseMediaSort(filters)],
      page,
      perPage,
    })
  );

  const anime = present(response.Page?.media).flatMap((media) => {
    const imageUrl = media.coverImage?.extraLarge ?? media.coverImage?.large;
    if (!imageUrl) {
      return [];
    }

    const title = mediaTitle(media);
    const titles = [
      title,
      media.title?.english,
      media.title?.romaji,
      media.title?.native,
      ...present(media.synonyms),
    ]
      .map((title) => title?.trim())
      .filter(
        (title, index, values): title is string => Boolean(title) && values.indexOf(title) === index
      );

    return [
      {
        anilistId: media.id,
        title,
        searchText: titles.join('\n'),
        imageUrl,
        synopsis: plainText(media.description),
        genres: present(media.genres),
        tags: present(media.tags).map(({ name }) => name),
        format: media.format,
        status: media.status,
        // Unknown classifications are excluded from safe browsing.
        isAdult: media.isAdult !== false,
        popularity: media.popularity,
        averageScore: media.averageScore,
      } satisfies BrowseCatalogEntry,
    ];
  });

  return {
    anime,
    hasNextPage: response.Page?.pageInfo?.hasNextPage === true,
  };
}

export function getBrowsePage(filters: AniListBrowseFilters, page: number, perPage: number) {
  return Effect.tryPromise({
    try: () => requestBrowsePage(filters, page, perPage),
    catch: (cause) =>
      cause instanceof GraphQLRequestError
        ? cause
        : new GraphQLRequestError({
            message: 'The anime catalog could not be loaded',
            cause,
          }),
  });
}

async function requestBrowseTaxonomy() {
  const response = await Effect.runPromise(request(BrowseAnimeTaxonomyDocument, {}));
  const sortedUnique = (values: string[]) =>
    [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
  const taxonomy = {
    genres: sortedUnique(present(response.GenreCollection)),
    tags: sortedUnique(
      present(response.tags)
        .filter(({ isAdult }) => isAdult === false)
        .map(({ name }) => name)
    ),
    formats: present(response.formats?.enumValues).map(({ name }) => name),
    statuses: present(response.statuses?.enumValues).map(({ name }) => name),
  } satisfies BrowseSourceTaxonomy;

  if (
    !taxonomy.genres.length ||
    !taxonomy.tags.length ||
    !taxonomy.formats.length ||
    !taxonomy.statuses.length
  ) {
    throw new GraphQLRequestError({
      message: 'AniList returned an incomplete browse taxonomy',
    });
  }

  return taxonomy;
}

export function getBrowseTaxonomy() {
  return Effect.tryPromise({
    try: requestBrowseTaxonomy,
    catch: (cause) =>
      cause instanceof GraphQLRequestError
        ? cause
        : new GraphQLRequestError({
            message: 'The anime browse filters could not be loaded',
            cause,
          }),
  });
}

export function isMediaFormat(taxonomy: BrowseSourceTaxonomy, value: string): value is MediaFormat {
  return taxonomy.formats.includes(value);
}

export function isMediaStatus(taxonomy: BrowseSourceTaxonomy, value: string): value is MediaStatus {
  return taxonomy.statuses.includes(value);
}
