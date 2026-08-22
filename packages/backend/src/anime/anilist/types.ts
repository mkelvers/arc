import type { AnimeQuery } from '@arc/shared/anilist/generated/graphql';
import { z } from 'zod';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;

export const AniListAnimeCacheSchema = z
    .looseObject({ id: z.number().int().positive() })
    .transform((value) => value as AniListAnime);
