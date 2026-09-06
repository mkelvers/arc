import { describe, expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({
    env: {
        API_ORIGIN: 'http://localhost:3000',
    },
}));

const { forwardAuthForm } = await import('./auth-form');

describe('forwardAuthForm', () => {
    test('forwards the resolved client address to the API', async () => {
        let receivedHeaders: Headers | undefined;

        await forwardAuthForm(
            (async (_input, init) => {
                receivedHeaders = new Headers(init?.headers);
                return new Response(null);
            }) as typeof fetch,
            { set() {} } as never,
            new Request('http://localhost/login'),
            '198.51.100.7',
            '/api/auth/sign-in/username',
            { username: 'arc', password: 'password' }
        );

        expect(receivedHeaders?.get('X-Forwarded-For')).toBe('198.51.100.7');
    });
});
