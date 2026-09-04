import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';

import { HomePageSchema } from '@arc/core/contracts/anime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, fetch }) => {
    const response = await fetch(`${env.API_ORIGIN!}/v1/home`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'The home page could not be loaded');
    }
    return HomePageSchema.parse(await response.json());
};

export const actions: Actions = {
    removeContinueWatching: async ({ locals, request, url, fetch }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }
        const animeId = Number((await request.formData()).get('animeId'));
        if (!Number.isSafeInteger(animeId) || animeId <= 0) {
            return fail(400, { message: 'Invalid anime ID' });
        }
        const response = await fetch(`${env.API_ORIGIN!}/v1/home/continue-watching/${animeId}`, {
            method: 'DELETE',
            headers: {
                Cookie: request.headers.get('cookie') ?? '',
                Authorization: request.headers.get('authorization') ?? '',
                Origin: url.origin,
            },
        }).catch(() => null);
        if (!response) {
            return fail(503, { message: 'Arc is temporarily unavailable' });
        }
        return response.ok
            ? { success: true }
            : fail(response.status, { message: 'Failed to remove continue watching' });
    },
};
