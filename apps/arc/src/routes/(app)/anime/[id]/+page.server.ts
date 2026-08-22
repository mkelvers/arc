import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { AnimePageSchema } from '@arc/api-contract/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, depends, request }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        error(400, 'Invalid anime ID');
    }
    depends(`arc:anime:${id}:episodes`);
    const response = await fetch(`${env.API_ORIGIN!}/v1/anime/${id}`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(response.status === 404 ? 404 : 502, 'Anime details could not be loaded');
    }
    const page = AnimePageSchema.parse(await response.json());
    return {
        ...page,
        artwork: Promise.resolve(page.artwork),
        episodes: Promise.resolve(page.episodes),
        episodeRevision: Promise.resolve(page.episodeRevision),
        watchAction: Promise.resolve(page.watchAction),
        audioLabel: Promise.resolve(page.audioLabel),
        franchise: Promise.resolve(page.franchise),
    };
};
