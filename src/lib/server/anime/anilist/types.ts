import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import type { AnimeCard } from '$lib/anime/types';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
export interface HomepageAnime {
  season: AnimeCard[];
  popular: AnimeCard[];
}
