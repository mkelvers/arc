import type {
    AnimeQuery,
    SearchAnimePageQuery,
} from '$lib/graphql/anilist/generated/graphql';
import type { AnimeCard } from '$lib/anime/types';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
export type SearchMedia = NonNullable<
    NonNullable<NonNullable<SearchAnimePageQuery['Page']>['media']>[number]
>;
export interface HomepageAnime {
    season: AnimeCard[];
}
