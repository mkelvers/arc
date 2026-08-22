import { error, redirect } from '@sveltejs/kit';

import { WatchlistPageResponseSchema } from '@arc/api-contract/watchlist';
import { serverApiClient } from '$lib/server/api-client';
import { WatchlistSelectionSchema } from '$lib/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
    const selection = WatchlistSelectionSchema.parse(Object.fromEntries(url.searchParams));
    const { data, response } = await serverApiClient(request).GET('/v1/watchlist', {
        params: { query: selection },
    });
    if (response.status === 401) {
        redirect(303, '/login');
    }
    if (!response.ok) {
        error(502, 'Your watchlist could not be loaded');
    }

    return {
        ...WatchlistPageResponseSchema.parse(data),
        selection,
    };
};
