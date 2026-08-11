import { isRecord } from '$lib/utils';

export type SkipKind = 'opening' | 'ending';
type SkipTimesSource = 'aniskip' | 'manual';

export interface SkipInterval {
    start: number;
    end: number;
}

export interface EpisodeSkipTimes {
    opening: SkipInterval | null;
    ending: SkipInterval | null;
    source: SkipTimesSource | null;
}

export interface SegmentTemplate {
    fromEpisode: number;
    duration: number;
}

export type SegmentTemplates = Record<SkipKind, SegmentTemplate | null>;

export interface SegmentSaveResult {
    times: EpisodeSkipTimes;
    templates: SegmentTemplates;
}

export interface SkipTimesDraft {
    opening: { start: number | null; end: number | null };
    ending: { start: number | null; end: number | null };
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

export function parseSegmentSaveResult(value: unknown): SegmentSaveResult | null {
    if (!isRecord(value) || !isRecord(value.times) || !isRecord(value.templates)) {
        return null;
    }

    const parseInterval = (candidate: unknown) => {
        if (candidate === null) {
            return null;
        }
        if (!isRecord(candidate)) {
            return undefined;
        }

        const { start, end } = candidate;
        return typeof start === 'number' &&
            typeof end === 'number' &&
            intervalFromTemplate(start, end - start)
            ? { start, end }
            : undefined;
    };
    const parseTemplate = (candidate: unknown) => {
        if (candidate === null) {
            return null;
        }
        if (!isRecord(candidate)) {
            return undefined;
        }

        const { fromEpisode, duration } = candidate;
        return typeof fromEpisode === 'number' &&
            Number.isSafeInteger(fromEpisode) &&
            fromEpisode > 0 &&
            typeof duration === 'number' &&
            intervalFromTemplate(0, duration)
            ? { fromEpisode, duration }
            : undefined;
    };
    const opening = parseInterval(value.times.opening);
    const ending = parseInterval(value.times.ending);
    const openingTemplate = parseTemplate(value.templates.opening);
    const endingTemplate = parseTemplate(value.templates.ending);
    if (
        opening === undefined ||
        ending === undefined ||
        openingTemplate === undefined ||
        endingTemplate === undefined ||
        value.times.source !== 'manual'
    ) {
        return null;
    }

    return {
        times: { opening, ending, source: 'manual' },
        templates: { opening: openingTemplate, ending: endingTemplate },
    };
}
