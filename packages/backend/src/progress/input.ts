import { z } from 'zod';

import type { JsonValue } from '../utils';

export interface PlaybackProgressInput {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
    eventAt: Date;
}

const playbackProgressSchema = z.object({
    animeId: z.number().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    episodeNumber: z.number().refine((value) => Math.abs(value) <= 1_000_000),
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z
        .number()
        .positive()
        .max(7 * 24 * 60 * 60),
    completed: z.boolean(),
    eventAt: z.number().int().nonnegative(),
});

export function parsePlaybackProgress(value: JsonValue): PlaybackProgressInput | null {
    const parsed = playbackProgressSchema.safeParse(value);
    if (!parsed.success || parsed.data.eventAt > Date.now() + 5 * 60 * 1_000) {
        return null;
    }

    return {
        animeId: parsed.data.animeId,
        episodeId: parsed.data.episodeId,
        episodeNumber: parsed.data.episodeNumber,
        positionSeconds: Math.min(parsed.data.positionSeconds, parsed.data.durationSeconds),
        durationSeconds: parsed.data.durationSeconds,
        completed: parsed.data.completed,
        eventAt: new Date(parsed.data.eventAt),
    };
}
