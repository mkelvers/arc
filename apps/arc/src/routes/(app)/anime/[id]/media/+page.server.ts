import { env } from '$env/dynamic/private';
import { error, fail } from '@sveltejs/kit';

import { MediaPageSchema } from '@arc/api-contract/anime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        error(400, 'Invalid anime ID');
    }
    const response = await fetch(`${env.API_ORIGIN!}/v1/anime/${id}/media`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).catch(() => null);
    if (!response) {
        error(503, 'Arc is temporarily unavailable');
    }
    if (!response.ok) {
        error(502, 'Anime media could not be loaded');
    }
    return MediaPageSchema.parse(await response.json());
};

export const actions: Actions = {
    default: async ({ params, request, url }) => {
        const id = Number(params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            error(400, 'Invalid anime ID');
        }
        const form = await request.formData();
        const intent = form.get('intent');
        const body =
            intent === 'refresh'
                ? { intent }
                : intent === 'logoSize'
                  ? { intent, logoSize: Number(form.get('logoSize')) }
                  : {
                        intent: 'select',
                        type: form.get('type'),
                        filePath: form.get('filePath') || null,
                    };
        const response = await fetch(`${env.API_ORIGIN!}/v1/anime/${id}/media`, {
            method: 'PUT',
            headers: {
                Cookie: request.headers.get('cookie') ?? '',
                Authorization: request.headers.get('authorization') ?? '',
                Origin: url.origin,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }).catch(() => null);
        if (!response) {
            return fail(503, { message: 'Arc is temporarily unavailable' });
        }
        return response.ok
            ? { success: true }
            : fail(response.status, { message: 'Media update failed' });
    },
};
