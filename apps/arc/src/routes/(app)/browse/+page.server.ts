import { error } from '@sveltejs/kit';

import { parseBrowseFilters } from '@arc/shared/browse';
import { BrowseFilterError, initialBrowsePage } from '@arc/backend/internal/anime/browse';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const filters = parseBrowseFilters(url.searchParams);
    if (!filters) {
        error(400, 'Invalid browse filters');
    }

    try {
        return {
            filters,
            ...(await initialBrowsePage(filters)),
        };
    } catch (cause) {
        if (cause instanceof BrowseFilterError) {
            error(400, cause.message);
        }

        console.error('Browse page load failed', cause);
        error(502, 'The anime catalog could not be loaded');
    }
};
