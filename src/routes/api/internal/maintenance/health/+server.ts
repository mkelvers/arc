import { env } from '$env/dynamic/private';

import { maintenanceHealth } from '$lib/server/maintenance';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    if (
        !env.ARC_MAINTENANCE_TOKEN ||
        request.headers.get('authorization') !== `Bearer ${env.ARC_MAINTENANCE_TOKEN}`
    ) {
        return new Response('Unauthorized', { status: 401 });
    }

    const health = await maintenanceHealth();
    return Response.json(health, {
        status: health.healthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
    });
};
