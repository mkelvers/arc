import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

import { refreshAiringAnime, scanAiringAnime } from '$lib/server/anime/airing-sync';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    if (
        !env.ARC_WORKER_TOKEN ||
        request.headers.get('authorization') !== `Bearer ${env.ARC_WORKER_TOKEN}`
    ) {
        return new Response('Unauthorized', { status: 401 });
    }

    return json(await scanAiringAnime());
};

export const POST: RequestHandler = async ({ request }) => {
    if (
        !env.ARC_WORKER_TOKEN ||
        request.headers.get('authorization') !== `Bearer ${env.ARC_WORKER_TOKEN}`
    ) {
        return new Response('Unauthorized', { status: 401 });
    }

    const body: unknown = await request.json();
    if (
        !body ||
        typeof body !== 'object' ||
        !('anilistId' in body) ||
        typeof body.anilistId !== 'number' ||
        !Number.isSafeInteger(body.anilistId) ||
        body.anilistId <= 0
    ) {
        return json({ message: 'Invalid AniList ID' }, { status: 400 });
    }

    const targetEpisode = 'targetEpisode' in body ? body.targetEpisode : undefined;
    if (
        targetEpisode !== undefined &&
        (typeof targetEpisode !== 'number' ||
            !Number.isSafeInteger(targetEpisode) ||
            targetEpisode <= 0)
    ) {
        return json({ message: 'Invalid target episode' }, { status: 400 });
    }

    return json(await refreshAiringAnime(body.anilistId, targetEpisode));
};
