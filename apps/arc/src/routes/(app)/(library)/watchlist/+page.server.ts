import { env } from '$env/dynamic/private';
import { WatchlistPageResponseSchema } from '@arc/core/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, fetch }) => {
    const page = await fetch(`${env.API_ORIGIN!}/v1/watchlist`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    })
        .then(async (response) => {
            if (!response.ok) {
                return {
                    status: 'error' as const,
                };
            }

            return {
                status: 'success' as const,
                data: WatchlistPageResponseSchema.parse(await response.json()),
            };
        })
        .catch(() => ({
            status: 'error' as const,
        }));

    return { page: Promise.resolve(page) };
};
