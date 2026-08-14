import { timingSafeEqual } from 'node:crypto';

import { env } from '$env/dynamic/private';

export function hasMaintenanceToken(request: Request) {
    const configuredToken = env.ARC_MAINTENANCE_TOKEN;
    const suppliedToken = request.headers.get('authorization');

    if (!configuredToken || !suppliedToken?.startsWith('Bearer ')) {
        return false;
    }

    const expected = new TextEncoder().encode(`Bearer ${configuredToken}`);
    const actual = new TextEncoder().encode(suppliedToken);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
