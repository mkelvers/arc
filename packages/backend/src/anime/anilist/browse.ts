import type { BrowseFilters } from '@arc/shared/browse';
import { z } from 'zod';
import {
    BrowseAnimePageDocument,
    BrowseAnimeTaxonomyDocument,
    type BrowseAnimePageQuery,
    type MediaFormat,
    type MediaSeason,
    type MediaSort,
    type MediaSource,
    type MediaStatus,
} from '@arc/shared/anilist/generated/graphql';
import { GraphQLRequestError } from '#graphql';
import { request } from './client';
import { mediaTitle, plainText, present } from './text';
import { discoveryFormats, discoveryMinimumPopularity, isDiscoverableAnime } from '../discovery';

export interface AniListBrowseFilters extends Omit<
    BrowseFilters,
    'format' | 'status' | 'source' | 'season' | 'audio'
> {
    format: MediaFormat | null;
    status: MediaStatus | null;
    source: MediaSource | null;
    season: MediaSeason | null;
}

export interface BrowseSourceTaxonomy {
    genres: string[];
    tags: string[];
    formats: string[];
    statuses: string[];
    sources: string[];
    seasons: string[];
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
    source: MediaSource | null;
    season: MediaSeason | null;
    seasonYear: number | null;
    countryOfOrigin: string | null;
    isAdult: boolean;
    popularity: number | null;
    duration: number | null;
    averageScore: number | null;
}

function browseEntries(
    mediaEntries: NonNullable<NonNullable<BrowseAnimePageQuery['Page']>['media']>,
    formats: readonly MediaFormat[] = discoveryFormats
) {
    return present(mediaEntries).flatMap((media) => {
        if (!isDiscoverableAnime(media, formats)) {
            return [];
        }

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
                (title, index, values): title is string =>
                    Boolean(title) && values.indexOf(title) === index
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
                source: media.source,
                season: media.season,
                seasonYear: media.seasonYear,
                countryOfOrigin:
                    z.string().nullable().safeParse(media.countryOfOrigin).data ?? null,
                isAdult: media.isAdult !== false,
                popularity: media.popularity,
                duration: media.duration,
                averageScore: media.averageScore,
            } satisfies BrowseCatalogEntry,
        ];
    });
}

export async function getBrowsePage(
    filters: AniListBrowseFilters,
    page: number,
    perPage: number,
    forceRefresh = false
) {
    const sort: MediaSort = filters.sort === 'score' ? 'SCORE' : 'POPULARITY';
    const formats: readonly MediaFormat[] =
        filters.format === 'MOVIE' ? ['MOVIE'] : discoveryFormats;
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
            minimumPopularity: discoveryMinimumPopularity - 1,
            page,
            perPage,
        },
        { forceRefresh }
    );

    const anime = browseEntries(response.Page?.media ?? [], formats);

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
        sources: present(response.sources?.enumValues).map(({ name }) => name),
        seasons: present(response.seasons?.enumValues).map(({ name }) => name),
    } satisfies BrowseSourceTaxonomy;

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
