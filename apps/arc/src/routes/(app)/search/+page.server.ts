import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { SearchResponseSchema } from '@arc/api-contract/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (query.length > 200) {
        error(400, 'Search queries cannot exceed 200 characters');
    }
    if (query.length < 2) {
        return { query, results: [] };
    }
    const response = await fetch(`${env.API_ORIGIN!}/v1/search?q=${encodeURIComponent(query)}`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'Anime search could not be loaded');
    }
    return { query, results: SearchResponseSchema.parse(await response.json()) };
};
