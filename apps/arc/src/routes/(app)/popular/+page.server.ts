import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { CatalogPageSchema } from '@arc/api-contract/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
    const response = await fetch(`${env.API_ORIGIN!}/v1/popular`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'Popular anime could not be loaded');
    }
    return CatalogPageSchema.parse(await response.json());
};
