import { expect, mock, test } from 'bun:test';

mock.module('$env/dynamic/private', () => ({
    env: {
        API_ORIGIN: 'https://api.example.test',
        BETTER_AUTH_URL: 'https://arc.example.test:5173',
    },
}));

const { actions } = await import('./+page.server');

test('forwards the configured auth origin when removing continue watching', async () => {
    let receivedHeaders: Headers | undefined;
    const form = new FormData();
    form.set('animeId', '123');

    await actions.removeContinueWatching?.({
        locals: { user: {} },
        request: new Request('https://arc.example.test:5174/', {
            method: 'POST',
            body: form,
        }),
        url: new URL('https://arc.example.test:5174/'),
        fetch: (async (_input, init) => {
            receivedHeaders = new Headers(init?.headers);
            return new Response(null, { status: 204 });
        }) as typeof fetch,
    } as never);

    expect(receivedHeaders?.get('Origin')).toBe('https://arc.example.test:5173');
});
