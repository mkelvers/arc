import type { AniListAnime } from './anilist-types';
import { z } from 'zod';

const storedAnimeDetailsSchema = z.looseObject({
    id: z.number().int(),
    title: z
        .object({
            english: z.string().nullable(),
            romaji: z.string().nullable(),
            native: z.string().nullable(),
        })
        .nullable(),
    bannerImage: z.string().nullable(),
    description: z.string().nullable(),
    genres: z.array(z.string().nullable()).nullable(),
    format: z.string().nullable(),
    status: z.string().nullable(),
    season: z.string().nullable(),
    seasonYear: z.number().int().nullable(),
    averageScore: z.number().nullable(),
    popularity: z.number().nullable(),
    favourites: z.number().nullable(),
    nextAiringEpisode: z
        .object({
            airingAt: z.number(),
            episode: z.number(),
        })
        .nullable(),
    rankings: z
        .array(
            z
                .object({
                    rank: z.number(),
                    type: z.string(),
                    year: z.number().nullable(),
                    season: z.string().nullable(),
                    allTime: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    tags: z
        .array(
            z
                .object({
                    name: z.string(),
                    rank: z.number().nullable(),
                    isGeneralSpoiler: z.boolean().nullable(),
                    isMediaSpoiler: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    studios: z
        .object({
            nodes: z
                .array(
                    z
                        .object({
                            name: z.string(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
    staff: z
        .object({
            edges: z
                .array(
                    z
                        .object({
                            role: z.string().nullable(),
                            node: z
                                .object({
                                    name: z
                                        .object({
                                            full: z.string().nullable(),
                                        })
                                        .nullable(),
                                })
                                .nullable(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

// Persisted JSON is intentionally unknown until this owning boundary validates it.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function parseStoredAnimeDetails(value: unknown) {
    const parsed = storedAnimeDetailsSchema.safeParse(value);
    return parsed.success ? (parsed.data as AniListAnime) : null;
}
