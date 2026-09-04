import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';

import { WatchPageSchema, WatchPlaybackSchema, WatchSegmentsSchema } from '@arc/core/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request, fetch }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        error(400, 'Invalid anime ID');
    }
    const headers = {
        Cookie: request.headers.get('cookie') ?? '',
        Authorization: request.headers.get('authorization') ?? '',
    };
    const endpoint = `${env.API_ORIGIN!}/v1/anime/${id}/episodes/${encodeURIComponent(params.episode)}`;
    const response = await fetch(endpoint, {
        headers,
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(response.status === 404 ? 404 : 502, 'Episode could not be loaded');
    }
    const page = WatchPageSchema.parse(await response.json());
    if (page.canonicalHref) {
        redirect(308, page.canonicalHref);
    }

    const segments = fetch(`${endpoint}/segments`, { headers })
        .then(async (result) => {
            if (!result.ok) {
                throw new Error(`Segment request failed with ${result.status}`);
            }
            return WatchSegmentsSchema.parse(await result.json());
        })
        .catch(() => ({
            times: {
                opening: null,
                ending: null,
                source: null,
            },
            templates: {
                opening: null,
                ending: null,
            },
        }));
    const playback = fetch(`${endpoint}/playback`, { headers })
        .then(async (result) => {
            if (!result.ok) {
                throw new Error(`Playback request failed with ${result.status}`);
            }
            return WatchPlaybackSchema.parse(await result.json());
        })
        .catch(() => ({
            streams: {},
            error: true,
        }));

    return {
        ...page,
        playbackEndpoint: `/v1/anime/${id}/episodes/${encodeURIComponent(params.episode)}/playback`,
        playback,
        segments: {
            canEdit: true,
            times: segments.then(({ times }) => times),
            templates: segments.then(({ templates }) => templates),
        },
    };
};
