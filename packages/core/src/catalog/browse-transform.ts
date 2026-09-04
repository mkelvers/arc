import type {
    BrowseAnimePageQuery,
    BrowseAnimeTaxonomyQuery,
    MediaFormat,
} from '@arc/shared/graphql/generated/graphql';
import { present } from '@arc/core/utils/array';
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
    return present(mediaEntries).flatMap((media) => {
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
                genres: present(media.genres),
                tags: present(media.tags).map(({ name }) => name),
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
        genres: [...new Set(present(response.GenreCollection))].sort((left, right) =>
            left.localeCompare(right, 'en')
        ),
        tags: [
            ...new Set(
                present(response.tags)
                    .filter(({ isAdult }) => isAdult === false)
                    .map(({ name }) => name)
            ),
        ].sort((left, right) => left.localeCompare(right, 'en')),
        formats: present(response.formats?.enumValues).map(({ name }) => name),
        statuses: present(response.statuses?.enumValues).map(({ name }) => name),
        sources: present(response.sources?.enumValues).map(({ name }) => name),
        seasons: present(response.seasons?.enumValues).map(({ name }) => name),
    };
}
