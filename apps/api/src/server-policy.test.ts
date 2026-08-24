import { describe, expect, test } from 'bun:test';

import { apiIdleTimeoutSeconds } from './server-policy';

describe('API server timeout policy', () => {
    test('allows cold first-contact anime requests to finish', () => {
        expect(apiIdleTimeoutSeconds).toBeGreaterThanOrEqual(30);
    });

    test('keeps an in-flight response open beyond Bun default idle timeout', async () => {
        const server = Bun.serve({
            port: 0,
            idleTimeout: apiIdleTimeoutSeconds,
            async fetch() {
                await Bun.sleep(10_500);
                return new Response('completed');
            },
        });

        try {
            const response = await fetch(server.url);
            expect(await response.text()).toBe('completed');
        } finally {
            await server.stop();
        }
    }, 15_000);
});
