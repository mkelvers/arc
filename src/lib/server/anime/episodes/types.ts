import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import type { animeEpisode } from '$lib/server/db/schema';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
export type StoredEpisode = typeof animeEpisode.$inferSelect;
