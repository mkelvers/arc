import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { CatalogPageSchema, CatalogTaxonomySchema } from '@arc/core/client';
import { browseSearchParams, parseBrowseFilters } from '@arc/core/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request, fetch }) => {
    const headers = {
        Cookie: request.headers.get('cookie') ?? '',
        Authorization: request.headers.get('authorization') ?? '',
    };
    const taxonomyResponse = await fetch(`${env.API_ORIGIN!}/v1/taxonomy`, { headers });
    if (!taxonomyResponse.ok) {
        error(503, 'Anime categories could not be loaded');
    }
    const taxonomy = CatalogTaxonomySchema.parse(await taxonomyResponse.json());
    const genre =
        taxonomy.genres.find(
            (genre) => genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') === params.genre
        ) ?? null;
    if (!genre) {
        error(404, 'Anime category not found');
    }

    const filters = parseBrowseFilters(new URLSearchParams({ genre }));
    if (!filters) {
        error(400, 'Invalid catalog filters');
    }
    const response = await fetch(`${env.API_ORIGIN!}/v1/popular?${browseSearchParams(filters)}`, {
        headers,
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'Anime category could not be loaded');
    }

    return { ...CatalogPageSchema.parse(await response.json()), filters, genre };
};
