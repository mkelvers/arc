import type { AnimeQuery, AnimeScheduleQuery } from '@arc/shared/anilist/generated/graphql';
import { z } from 'zod';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;
export type AniListSchedule = NonNullable<AnimeScheduleQuery['Media']>;

const nullableString = z.string().nullable();
const nullableInteger = z.number().int().nullable();
const titleSchema = z
    .object({ english: nullableString, romaji: nullableString, native: nullableString })
    .nullable();
const dateSchema = z
    .object({ year: nullableInteger, month: nullableInteger, day: nullableInteger })
    .nullable();
const nextAiringSchema = z
    .object({ airingAt: z.number().int().positive(), episode: z.number().int().positive() })
    .nullable();

export const AniListAnimeSchema = z
    .looseObject({
        id: z.number().int().positive(),
        idMal: nullableInteger,
        title: titleSchema,
        synonyms: z.array(nullableString).nullable(),
        coverImage: z
            .object({ extraLarge: nullableString, large: nullableString })
            .nullable()
            .optional()
            .transform((value) => value ?? null),
        bannerImage: nullableString,
        description: nullableString,
        genres: z.array(nullableString).nullable(),
        format: nullableString,
        status: nullableString,
        season: nullableString,
        seasonYear: nullableInteger,
        startDate: dateSchema,
        endDate: dateSchema,
        episodes: nullableInteger,
        duration: nullableInteger,
        nextAiringEpisode: nextAiringSchema,
        relations: z
            .object({
                edges: z
                    .array(
                        z
                            .object({
                                relationType: nullableString,
                                node: z
                                    .object({
                                        id: z.number().int().positive(),
                                        idMal: nullableInteger,
                                        episodes: nullableInteger,
                                        type: nullableString,
                                        title: titleSchema,
                                    })
                                    .nullable(),
                            })
                            .nullable()
                    )
                    .nullable(),
            })
            .nullable(),
        averageScore: z.number().nullable(),
        popularity: z.number().nullable(),
        favourites: z.number().nullable(),
        rankings: z
            .array(
                z
                    .object({
                        rank: z.number(),
                        type: z.string(),
                        year: nullableInteger,
                        season: nullableString,
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
            .object({ nodes: z.array(z.object({ name: z.string() }).nullable()).nullable() })
            .nullable(),
        staff: z
            .object({
                edges: z
                    .array(
                        z
                            .object({
                                role: nullableString,
                                node: z
                                    .object({
                                        name: z.object({ full: nullableString }).nullable(),
                                    })
                                    .nullable(),
                            })
                            .nullable()
                    )
                    .nullable(),
            })
            .nullable(),
    })
    .transform((value) => value as AniListAnime);

export const AniListScheduleSchema = z
    .object({
        id: z.number().int().positive(),
        status: nullableString,
        episodes: nullableInteger,
        nextAiringEpisode: nextAiringSchema,
    })
    .transform((value) => value as AniListSchedule);
