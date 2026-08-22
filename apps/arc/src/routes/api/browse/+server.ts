import { error, json } from '@sveltejs/kit';

import { parseBrowseFilters } from '@arc/shared/browse';
import { browsePage, BrowseFilterError } from '@arc/backend/internal/anime/browse';
import { positiveInteger } from '$lib/utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const filters = parseBrowseFilters(url.searchParams);
    const page = positiveInteger(url.searchParams.get('page'));
    if (!filters || !page) {
        error(400, 'Valid browse filters and a page are required');
    }

    try {
        const result = await browsePage(filters, page);
        return json({
            anime: result.anime,
            hasNextPage: result.hasNextPage,
            page: result.page,
        });
    } catch (cause) {
        if (cause instanceof BrowseFilterError) {
            error(400, cause.message);
        }

        error(502, 'More anime could not be loaded');
    }
};
