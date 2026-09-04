import type { BrowseFilters } from '@arc/core/catalog/browse-filters';
import {
    BrowseAnimePageDocument,
    BrowseAnimeTaxonomyDocument,
    type MediaFormat,
    type MediaSeason,
    type MediaSort,
    type MediaSource,
    type MediaStatus,
} from '@arc/shared/graphql/generated/graphql';
import { GraphQLRequestError } from '#graphql';
import { request } from './client';
import {
    transformBrowseEntries,
    transformBrowseTaxonomy,
} from '@arc/core/catalog/browse-transform';

export interface AniListBrowseFilters extends Omit<
    BrowseFilters,
    'format' | 'status' | 'source' | 'season' | 'audio'
> {
    format: MediaFormat | null;
    status: MediaStatus | null;
    source: MediaSource | null;
    season: MediaSeason | null;
}

export async function getBrowsePage(
    filters: AniListBrowseFilters,
    page: number,
    perPage: number,
    forceRefresh = false
) {
    const sort: MediaSort = filters.sort === 'score' ? 'SCORE' : 'POPULARITY';
    const formats: readonly MediaFormat[] = filters.format === 'MOVIE' ? ['MOVIE'] : ['TV', 'ONA'];
    const response = await request(
        BrowseAnimePageDocument,
        {
            search: filters.query || undefined,
            genre: filters.genre ?? undefined,
            tag: filters.tag ?? undefined,
            format: filters.format === 'MOVIE' ? undefined : (filters.format ?? undefined),
            status: filters.status ?? undefined,
            source: filters.source ?? undefined,
            season: filters.season ?? undefined,
            seasonYear: filters.year ?? undefined,
            countryOfOrigin: filters.country ?? undefined,
            isAdult: filters.safe ? false : undefined,
            sort: [filters.order === 'desc' ? `${sort}_DESC` : sort],
            discoveryFormats: [...formats],
            minimumPopularity: 1_999,
            page,
            perPage,
        },
        { forceRefresh }
    );

    const anime = transformBrowseEntries(response.Page?.media ?? [], formats);

    return {
        anime,
        hasNextPage: response.Page?.pageInfo?.hasNextPage === true,
    };
}

export async function getBrowseTaxonomy(forceRefresh = false) {
    const response = await request(
        BrowseAnimeTaxonomyDocument,
        {},
        {
            refreshAfterMs: 7 * 24 * 60 * 60 * 1_000,
            forceRefresh,
        }
    );
    const taxonomy = transformBrowseTaxonomy(response);

    if (
        !taxonomy.genres.length ||
        !taxonomy.tags.length ||
        !taxonomy.formats.length ||
        !taxonomy.statuses.length ||
        !taxonomy.sources.length ||
        !taxonomy.seasons.length
    ) {
        throw new GraphQLRequestError({
            message: 'AniList returned an incomplete browse taxonomy',
        });
    }

    return taxonomy;
}
