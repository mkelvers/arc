import { hasMaintenanceToken } from '$lib/server/maintenance-auth';
import { maintenanceHealth } from '$lib/server/maintenance';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    if (!hasMaintenanceToken(request)) {
        return new Response('Unauthorized', { status: 401 });
    }

    const health = await maintenanceHealth();
    return Response.json(health, {
        status: health.healthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
    });
};
