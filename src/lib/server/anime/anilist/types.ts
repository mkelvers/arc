import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
