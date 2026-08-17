import { hasMaintenanceToken } from '$lib/server/maintenance-auth';
import { runMaintenance } from '$lib/server/maintenance';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    if (!hasMaintenanceToken(request)) {
        return new Response('Unauthorized', { status: 401 });
    }

    const result = await runMaintenance();
    return Response.json(result, {
        status: result.healthy ? 200 : 500,
        headers: { 'Cache-Control': 'no-store' },
    });
};
