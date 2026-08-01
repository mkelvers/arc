import type {
    EpisodeSkipTimes,
    SkipInterval,
} from '$lib/player/skip-times';
import { isRecord } from '$lib/utils';

const apiBaseUrl = 'https://api.aniskip.com/v2/skip-times';
const maximumEpisodeSeconds = 7 * 24 * 60 * 60;

function interval(start: unknown, end: unknown): SkipInterval | null {
    if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > maximumEpisodeSeconds
    ) {
        return null;
    }

    return { start, end };
}

export function parseAniSkipResponse(value: unknown): EpisodeSkipTimes | null {
    if (
        !isRecord(value) ||
        value.found !== true ||
        !Array.isArray(value.results)
    ) {
        return value && isRecord(value) && value.found === false
            ? { opening: null, ending: null, source: 'aniskip' }
            : null;
    }

    const times: EpisodeSkipTimes = {
        opening: null,
        ending: null,
        source: 'aniskip',
    };

    for (const result of value.results) {
        if (!isRecord(result) || !isRecord(result.interval)) {
            continue;
        }

        const parsed = interval(
            result.interval.startTime,
            result.interval.endTime,
        );
        if (!parsed) {
            continue;
        }

        if (result.skipType === 'op') {
            times.opening = parsed;
        } else if (result.skipType === 'mixed-op' && !times.opening) {
            times.opening = parsed;
        } else if (result.skipType === 'ed') {
            times.ending = parsed;
        } else if (result.skipType === 'mixed-ed' && !times.ending) {
            times.ending = parsed;
        }
    }

    return times;
}

export async function fetchAniSkip(
    malId: number,
    episodeNumber: number,
): Promise<EpisodeSkipTimes> {
    const query = new URLSearchParams({ episodeLength: '0' });
    for (const type of ['op', 'ed', 'mixed-op', 'mixed-ed']) {
        query.append('types', type);
    }
    const response = await fetch(
        `${apiBaseUrl}/${malId}/${episodeNumber}?${query}`,
        {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(5_000),
        },
    );
    if (response.status === 404) {
        console.info(
            `AniSkip has no skip times for MAL ${malId}, episode ${episodeNumber}`,
        );
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

export function validSkipInterval(value: unknown): SkipInterval | null {
    return isRecord(value) ? interval(value.start, value.end) : null;
}
