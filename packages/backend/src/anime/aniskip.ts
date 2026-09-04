import type { EpisodeSkipTimes, SkipInterval } from '@arc/core';
import { z } from 'zod';

import type { JsonValue } from '#utils';

const apiBaseUrl = 'https://api.aniskip.com/v2/skip-times';
const maximumEpisodeSeconds = 7 * 24 * 60 * 60;
const aniskipIntervalSchema = z.object({
    startTime: z.number(),
    endTime: z.number(),
});
const aniskipResponseSchema = z.object({
    found: z.boolean(),
    results: z.array(z.unknown()).optional(),
});
const aniskipResultSchema = z.object({
    skipType: z.string(),
    interval: aniskipIntervalSchema,
});
export const SkipIntervalInputSchema = z.object({
    start: z.number(),
    end: z.number(),
});

function interval(start: number, end: number): SkipInterval | null {
    if (start < 0 || end <= start || end > maximumEpisodeSeconds) {
        return null;
    }

    return { start, end };
}

export function parseAniSkipResponse(value: JsonValue): EpisodeSkipTimes | null {
    const parsedResponse = aniskipResponseSchema.safeParse(value);
    if (!parsedResponse.success) {
        return null;
    }
    if (!parsedResponse.data.found) {
        return { opening: null, ending: null, source: 'aniskip' };
    }
    if (!parsedResponse.data.results) {
        return null;
    }

    const times: EpisodeSkipTimes = {
        opening: null,
        ending: null,
        source: 'aniskip',
    };

    for (const rawResult of parsedResponse.data.results) {
        const parsedResult = aniskipResultSchema.safeParse(rawResult);
        if (!parsedResult.success) {
            continue;
        }

        const parsed = interval(
            parsedResult.data.interval.startTime,
            parsedResult.data.interval.endTime
        );
        if (!parsed) {
            continue;
        }

        if (parsedResult.data.skipType === 'op') {
            times.opening = parsed;
        } else if (parsedResult.data.skipType === 'mixed-op' && !times.opening) {
            times.opening = parsed;
        } else if (parsedResult.data.skipType === 'ed') {
            times.ending = parsed;
        } else if (parsedResult.data.skipType === 'mixed-ed' && !times.ending) {
            times.ending = parsed;
        }
    }

    return times;
}

export async function fetchAniSkip(
    malId: number,
    episodeNumber: number
): Promise<EpisodeSkipTimes> {
    const query = new URLSearchParams({ episodeLength: '0' });
    for (const type of ['op', 'ed', 'mixed-op', 'mixed-ed']) {
        query.append('types', type);
    }
    const response = await fetch(`${apiBaseUrl}/${malId}/${episodeNumber}?${query}`, {
        headers: {
            accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) {
        return { opening: null, ending: null, source: 'aniskip' };
    }
    if (!response.ok) {
        throw new Error(`AniSkip request failed with ${response.status}`);
    }

    const parsed = parseAniSkipResponse(await response.json());
    if (!parsed) {
        throw new Error('AniSkip returned an invalid response');
    }

    return parsed;
}

export function validSkipInterval(value: JsonValue): SkipInterval | null {
    const parsed = SkipIntervalInputSchema.safeParse(value);
    return parsed.success ? interval(parsed.data.start, parsed.data.end) : null;
}
