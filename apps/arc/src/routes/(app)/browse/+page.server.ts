import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { BrowsePageSchema } from '@arc/api-contract/anime';
import { parseBrowseFilters } from '@arc/shared/browse';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request }) => {
    const filters = parseBrowseFilters(url.searchParams);
    if (!filters) {
        error(400, 'Invalid browse filters');
    }
    const response = await fetch(`${env.API_ORIGIN!}/v1/browse?${url.searchParams}`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(response.status === 400 ? 400 : 502, 'The anime catalog could not be loaded');
    }
    return { filters, ...BrowsePageSchema.parse(await response.json()) };
};
