import { z } from 'zod';

export type SkipKind = 'opening' | 'ending';
const SkipTimesSourceSchema = z.enum(['anikoto', 'aniskip', 'manual']);
type SkipTimesSource = z.infer<typeof SkipTimesSourceSchema>;

export const SkipIntervalSchema = z
    .object({
        start: z.number().nonnegative(),
        end: z.number().positive(),
    })
    .refine(({ start, end }) => end > start);

export type SkipInterval = z.infer<typeof SkipIntervalSchema>;

export const EpisodeSkipTimesSchema = z.object({
    opening: SkipIntervalSchema.nullable(),
    ending: SkipIntervalSchema.nullable(),
    sources: z.object({
        opening: SkipTimesSourceSchema.nullable(),
        ending: SkipTimesSourceSchema.nullable(),
    }),
});

export type EpisodeSkipTimes = {
    opening: SkipInterval | null;
    ending: SkipInterval | null;
    sources: {
        opening: SkipTimesSource | null;
        ending: SkipTimesSource | null;
    };
};

const SegmentTemplateSchema = z.object({
    fromEpisode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    duration: z.number().positive(),
});

type SegmentTemplate = z.infer<typeof SegmentTemplateSchema>;

export type SegmentTemplates = Record<SkipKind, SegmentTemplate | null>;

export const SegmentSaveResultSchema = z.object({
    times: EpisodeSkipTimesSchema,
    templates: z.object({
        opening: SegmentTemplateSchema.nullable(),
        ending: SegmentTemplateSchema.nullable(),
    }),
});

interface SkipTimesDraft {
    opening: {
        start: number | null;
        end: number | null;
    };
    ending: {
        start: number | null;
        end: number | null;
    };
}

export function skipTimesDraft(times: EpisodeSkipTimes): SkipTimesDraft {
    return {
        opening: {
            start: times.opening?.start ?? null,
            end: times.opening?.end ?? null,
        },
        ending: {
            start: times.ending?.start ?? null,
            end: times.ending?.end ?? null,
        },
    };
}

export function preferManualSkipTimes(
    provider: EpisodeSkipTimes | null,
    persisted: EpisodeSkipTimes
): EpisodeSkipTimes {
    if (!provider) {
        return persisted;
    }

    return {
        opening: persisted.sources.opening === 'manual' ? persisted.opening : provider.opening,
        ending: persisted.sources.ending === 'manual' ? persisted.ending : provider.ending,
        sources: {
            opening: persisted.sources.opening === 'manual' ? 'manual' : provider.sources.opening,
            ending: persisted.sources.ending === 'manual' ? 'manual' : provider.sources.ending,
        },
    };
}

export function activeSkip(
    times: EpisodeSkipTimes,
    currentTime: number
): { kind: SkipKind; interval: SkipInterval } | null {
    for (const kind of ['opening', 'ending'] as const) {
        const interval = times[kind];
        if (interval && currentTime >= interval.start && currentTime < interval.end) {
            return { kind, interval };
        }
    }

    return null;
}

export function intervalFromTemplate(start: number, duration: number): SkipInterval | null {
    const end = start + duration;
    if (
        !Number.isFinite(start) ||
        !Number.isFinite(duration) ||
        !Number.isFinite(end) ||
        start < 0 ||
        duration <= 0
    ) {
        return null;
    }

    return { start, end };
}
