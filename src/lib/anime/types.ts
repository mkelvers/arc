import { z } from 'zod';

import type { AudioMode } from './audio';

export const AnimeCardSchema = z.object({
    id: z.number().int(),
    href: z.string().startsWith('/anime/'),
    link: z.string(),
    title: z.string(),
    image: z.string(),
    audioLabel: z.string(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
});

export type AnimeCard = z.infer<typeof AnimeCardSchema>;

const AnimeCardPageSchema = z.object({
    anime: z.array(AnimeCardSchema),
    hasNextPage: z.boolean(),
    page: z.number().int(),
});

export function isAnimeCardPage(value: unknown): value is z.infer<typeof AnimeCardPageSchema> {
    return AnimeCardPageSchema.safeParse(value).success;
}

export type AnimeEpisode = {
    id: string;
    number: number;
    label: string;
    title: string;
    href: string;
    audio: AudioMode[];
    image: string | null;
    duration: string;
    releaseDate: string;
    overview: string;
};

export type ContinueWatchingCard = {
    animeId: number;
    title: string;
    link: string;
    backdrop: string;
    episodeImage: string;
    episodeLabel: string;
    audioLabel: string;
    duration: string;
    resumeAtSeconds: number;
};

export type FranchiseOrder = {
    types: Array<{
        id: string;
        label: string;
    }>;
    entries: Array<
        AnimeCard & {
            malId: number;
            anilistId: number;
            type: string;
            secondary: boolean;
            primary: boolean;
        }
    >;
};
