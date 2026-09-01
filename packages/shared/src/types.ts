import { z } from 'zod';

import type { AudioMode } from './audio';
import type { MediaFormat, MediaRelation, MediaStatus } from './anilist/generated/graphql';

export const AnimeCardSchema = z.object({
    id: z.number().int().positive(),
    href: z.string(),
    link: z.string(),
    title: z.string(),
    image: z.string(),
    audioLabel: z.string(),
    format: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    releasedAt: z.iso.datetime().optional(),
    episode: z.number().int().positive().optional(),
});

export type AnimeCard = z.infer<typeof AnimeCardSchema>;

export const AnimeCardPageSchema = z.object({
    anime: z.array(AnimeCardSchema),
    hasNextPage: z.boolean(),
    page: z.number().int(),
});

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
    progress?: {
        positionSeconds: number;
        durationSeconds: number;
        completed: boolean;
        hasCompleted: boolean;
        completedAt: string | null;
    } | null;
};

export const EpisodeRevisionSchema = z.object({
    revision: z.string().nullable(),
});

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
            format: MediaFormat | null;
            status: MediaStatus | null;
            episodes: number | null;
            duration: number | null;
            popularity: number | null;
            relations: Array<{ type: MediaRelation; malId: number }>;
            secondary: boolean;
            primary: boolean;
        }
    >;
};
