import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { ReleaseCalendarSchema } from '@arc/core/contracts/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, fetch }) => {
    const response = await fetch(`${env.API_ORIGIN!}/v1/schedule`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);

    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'Release calendar could not be loaded');
    }

    return ReleaseCalendarSchema.parse(await response.json());
};
