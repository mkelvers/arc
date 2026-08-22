import { env } from '$env/dynamic/public';
import { createAuthClient } from 'better-auth/svelte';
import { usernameClient } from 'better-auth/client/plugins';

if (!env.PUBLIC_API_ORIGIN) {
    throw new TypeError('PUBLIC_API_ORIGIN is required');
}

export const authClient = createAuthClient({
    baseURL: env.PUBLIC_API_ORIGIN,
    fetchOptions: { credentials: 'include' },
    plugins: [usernameClient()],
});
