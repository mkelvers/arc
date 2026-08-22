import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';

import { WatchlistPageResponseSchema } from '@arc/api-contract/watchlist';
import { WatchlistSelectionSchema } from '$lib/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
    const selection = WatchlistSelectionSchema.parse(Object.fromEntries(url.searchParams));
    const response = await fetch(
        `${env.API_ORIGIN!}/v1/watchlist?${new URLSearchParams(selection)}`,
        {
            headers: {
                Cookie: request.headers.get('cookie') ?? '',
                Authorization: request.headers.get('authorization') ?? '',
            },
        }
    );
    if (response.status === 401) {
        redirect(303, '/login');
    }
    if (!response.ok) {
        error(502, 'Your watchlist could not be loaded');
    }

    return {
        ...WatchlistPageResponseSchema.parse(await response.json()),
        selection,
    };
};
