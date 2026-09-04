import type {
    MediaFormat,
    MediaSeason,
    MediaSource,
    MediaStatus,
} from '@arc/shared/anilist/generated/graphql';

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
