import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { AnimePageOverviewSchema } from '@arc/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, depends, request, fetch }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        error(400, 'Invalid anime ID');
    }
    depends(`arc:anime:${id}:overview`);
    return {
        animeId: id,
        page: fetch(`${env.API_ORIGIN!}/v1/anime/${id}`, {
            headers: {
                Cookie: request.headers.get('cookie') ?? '',
                Authorization: request.headers.get('authorization') ?? '',
            },
        })
            .then(async (response) => {
                if (!response.ok) {
                    console.error(`Anime page API returned ${response.status} for ${id}`);
                    return {
                        status:
                            response.status === 404 ? ('not-found' as const) : ('error' as const),
                    };
                }

                return {
                    status: 'success' as const,
                    data: AnimePageOverviewSchema.parse(await response.json()),
                };
            })
            .catch((cause) => {
                const error = cause as {
                    code?: unknown;
                    cause?: {
                        code?: unknown;
                    };
                };
                const disconnected =
                    error.code === 'UND_ERR_SOCKET' ||
                    error.cause?.code === 'UND_ERR_SOCKET' ||
                    (cause instanceof DOMException && cause.name === 'AbortError');
                if (!disconnected) {
                    console.error(`Anime page API request failed for ${id}`, cause);
                }
                return {
                    status: 'error' as const,
                };
            }),
    };
};
