import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { SimulcastPageSchema } from '@arc/api-contract/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request, fetch }) => {
    const response = await fetch(`${env.API_ORIGIN!}/v1/simulcast?${url.searchParams}`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(response.status === 404 ? 404 : 502, 'Simulcast could not be loaded');
    }
    return SimulcastPageSchema.parse(await response.json());
};
