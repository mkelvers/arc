import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';

import { WatchlistPageResponseSchema } from '@arc/api-contract/watchlist';
import { WatchlistSelectionSchema } from '$lib/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
    const selection = WatchlistSelectionSchema.parse(Object.fromEntries(url.searchParams));
    const search = new URLSearchParams(selection);
    const headers = new Headers({ Accept: 'application/json' });
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    if (cookie) {
        headers.set('cookie', cookie);
    }
    if (authorization) {
        headers.set('authorization', authorization);
    }

    const response = await fetch(new URL(`/v1/watchlist?${search}`, env.API_ORIGIN!), { headers });
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
