import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { AnimePageSchema } from '@arc/api-contract/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, depends, request, fetch }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        error(400, 'Invalid anime ID');
    }
    depends(`arc:anime:${id}:episodes`);
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
                    data: AnimePageSchema.parse(await response.json()),
                };
            })
            .catch((cause) => {
                console.error(`Anime page API request failed for ${id}`, cause);
                return { status: 'error' as const };
            }),
    };
};
