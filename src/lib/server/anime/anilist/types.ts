import type {
    AnimeQuery,
    HomeAnimeQuery,
    SearchAnimePageQuery,
} from '$lib/graphql/anilist/generated/graphql';
import type { AnimeCard } from '$lib/anime/types';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
export type SearchMedia = NonNullable<
    NonNullable<NonNullable<SearchAnimePageQuery['Page']>['media']>[number]
>;
export type HomeMedia = NonNullable<
    NonNullable<NonNullable<HomeAnimeQuery['highlights']>['media']>[number]
>;

export interface HomepageHighlight {
    id: number;
    title: string;
    image: string;
    description: string;
    genres: string[];
    format: string;
    score: number;
}

export interface HomepageAnime {
    highlights: HomepageHighlight[];
    season: AnimeCard[];
}
