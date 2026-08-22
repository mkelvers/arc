import { env } from '$env/dynamic/public';
import createClient from 'openapi-fetch';

import type { paths } from '@arc/api-contract/generated';

if (!env.PUBLIC_API_ORIGIN) {
    throw new TypeError('PUBLIC_API_ORIGIN is required');
}

export const apiClient = createClient<paths>({
    baseUrl: env.PUBLIC_API_ORIGIN,
    credentials: 'include',
    headers: { Accept: 'application/json' },
});
