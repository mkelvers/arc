import { env } from '$env/dynamic/private';
import { WatchlistPageResponseSchema } from '@arc/api-contract/watchlist';
import { WatchlistSelectionSchema } from '$lib/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url, fetch }) => {
    const selection = WatchlistSelectionSchema.parse(Object.fromEntries(url.searchParams));
    return {
        selection,
        page: fetch(`${env.API_ORIGIN!}/v1/watchlist?${new URLSearchParams(selection)}`, {
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
            })),
    };
};
