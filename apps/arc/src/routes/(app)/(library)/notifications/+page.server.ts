import { env } from '$env/dynamic/private';
import { NotificationsResponseSchema } from '@arc/core/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, fetch }) => ({
    notifications: fetch(`${env.API_ORIGIN!}/v1/notifications`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    }).then(async (response) => {
        if (!response.ok) throw new Error('Notifications unavailable');
        return NotificationsResponseSchema.parse(await response.json());
    }),
});
