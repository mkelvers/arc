import type {
    BrowseAnimePageQuery,
    BrowseAnimeTaxonomyQuery,
    MediaFormat,
} from '@arc/shared/anilist/generated/graphql';
import { animeTitles, mediaTitle, plainText } from './anilist-text';
import { isDiscoverableAnime } from './discovery';
import type { BrowseCatalogEntry } from './browse-types';

export interface BrowseSourceTaxonomy {
    genres: string[];
    tags: string[];
    formats: string[];
    statuses: string[];
    sources: string[];
    seasons: string[];
}

export function transformBrowseEntries(
    mediaEntries: NonNullable<NonNullable<BrowseAnimePageQuery['Page']>['media']>,
    formats: readonly MediaFormat[] = ['TV', 'ONA']
) {
    return mediaEntries
        .filter((value) => value !== null)
        .flatMap((media) => {
            if (!isDiscoverableAnime(media, formats)) {
                return [];
            }

            const imageUrl = media.coverImage?.extraLarge ?? media.coverImage?.large;
            if (!imageUrl) {
                return [];
            }

            const title = mediaTitle(media);
            const searchText = [title, ...animeTitles(media)]
                .map((value) => value.trim())
                .filter(
                    (value, index, values): value is string =>
                        Boolean(value) && values.indexOf(value) === index
                )
                .join('\n');

            return [
                {
                    anilistId: media.id,
                    title,
                    searchText,
                    imageUrl,
                    synopsis: plainText(media.description),
                    genres: media.genres?.filter((genre) => genre !== null) ?? [],
                    tags: (media.tags?.filter((tag) => tag !== null) ?? []).map(({ name }) => name),
                    format: media.format,
                    status: media.status,
                    source: media.source,
                    season: media.season,
                    seasonYear: media.seasonYear,
                    countryOfOrigin:
                        typeof media.countryOfOrigin === 'string' ? media.countryOfOrigin : null,
                    isAdult: media.isAdult !== false,
                    popularity: media.popularity,
                    duration: media.duration,
                    averageScore: media.averageScore,
                } satisfies BrowseCatalogEntry,
            ];
        });
}

export function transformBrowseTaxonomy(response: BrowseAnimeTaxonomyQuery): BrowseSourceTaxonomy {
    return {
        genres: [
            ...new Set(response.GenreCollection?.filter((value) => value !== null) ?? []),
        ].sort((left, right) => left.localeCompare(right, 'en')),
        tags: [
            ...new Set(
                (response.tags?.filter((value) => value !== null) ?? [])
                    .filter(({ isAdult }) => isAdult === false)
                    .map(({ name }) => name)
            ),
        ].sort((left, right) => left.localeCompare(right, 'en')),
        formats: (response.formats?.enumValues ?? []).map(({ name }) => name),
        statuses: (response.statuses?.enumValues ?? []).map(({ name }) => name),
        sources: (response.sources?.enumValues ?? []).map(({ name }) => name),
        seasons: (response.seasons?.enumValues ?? []).map(({ name }) => name),
    };
}
