import { env } from '$env/dynamic/private';
import { ApiErrorSchema } from '@arc/core/contracts/auth';
import { WatchlistImportResponseSchema } from '@arc/core/contracts/watchlist';
import { fail, type RequestEvent } from '@sveltejs/kit';
import type { Actions } from './$types';

async function importFile({ fetch, request, url }: RequestEvent) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
        return fail(400, { message: 'Choose a library file.', success: false });
    }

    const body = new FormData();
    body.set('watchlist', file);
    body.set('replace', form.get('mode') === 'replace' ? 'true' : 'false');
    const response = await fetch(`${env.API_ORIGIN!}/v1/watchlist/import`, {
        method: 'POST',
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
            Origin: request.headers.get('origin') ?? url.origin,
        },
        body,
    });

    if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(await response.json());
        return fail(response.status, {
            message: parsed.success
                ? parsed.data.error.message
                : 'Nothing was changed. The watchlist import failed.',
            success: false,
        });
    }

    return {
        message: WatchlistImportResponseSchema.parse(await response.json()).message,
        success: true,
    };
}

export const actions: Actions = {
    import: importFile,
};
