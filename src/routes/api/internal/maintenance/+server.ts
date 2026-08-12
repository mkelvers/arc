import { env } from '$env/dynamic/private';

import { runMaintenance } from '$lib/server/maintenance';
import type { RequestHandler } from './$types';

const handle: RequestHandler = async ({ request }) => {
    if (
        !env.ARC_MAINTENANCE_TOKEN ||
        request.headers.get('authorization') !== `Bearer ${env.ARC_MAINTENANCE_TOKEN}`
    ) {
        return new Response('Unauthorized', { status: 401 });
    }

    const result = await runMaintenance();
    return Response.json(result, {
        status: result.healthy ? 200 : 500,
        headers: { 'Cache-Control': 'no-store' },
    });
};

export const GET = handle;
export const POST = handle;
