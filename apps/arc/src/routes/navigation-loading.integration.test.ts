import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));
const runner = String.raw`
    import { createServer } from 'vite';

    const api = Bun.serve({
        port: 0,
        async fetch() {
            await Bun.sleep(250);
            return Response.json({});
        },
    });
    process.env.API_ORIGIN = 'http://127.0.0.1:' + api.port;
    const vite = await createServer({ appType: 'custom', server: { middlewareMode: true } });
    let eventFetchCalls = 0;
    const eventFetch = (...arguments_) => {
        eventFetchCalls += 1;
        return globalThis.fetch(...arguments_);
    };
    const routes = [
        {
            path: './src/routes/(app)/anime/[id]/+page.server.ts',
            arguments: {
                params: { id: '1' },
                depends() {},
                request: new Request('http://arc.test/anime/1'),
                fetch: eventFetch,
            },
        },
        {
            path: './src/routes/(app)/watchlist/+page.server.ts',
            arguments: {
                request: new Request('http://arc.test/watchlist'),
                url: new URL('http://arc.test/watchlist'),
                fetch: eventFetch,
            },
        },
        {
            path: './src/routes/(app)/search/+page.server.ts',
            arguments: {
                request: new Request('http://arc.test/search?q=bleach'),
                url: new URL('http://arc.test/search?q=bleach'),
                fetch: eventFetch,
            },
        },
    ];

    try {
        for (const route of routes) {
            const module = await vite.ssrLoadModule(route.path);
            const callsBeforeLoad = eventFetchCalls;
            const page = module.load(route.arguments);
            if (eventFetchCalls !== callsBeforeLoad + 1) {
                throw new Error(route.path + ' did not use the load event fetch');
            }
            const result = await Promise.race([
                page.then(() => 'returned'),
                Bun.sleep(75).then(() => 'blocked'),
            ]);
            if (result !== 'returned') {
                throw new Error(route.path + ' blocked navigation');
            }
        }
    } finally {
        await vite.close();
        api.stop(true);
    }
`;

test('slow page APIs do not block navigation from reaching a loading state', async () => {
    const child = Bun.spawn([process.execPath, '-e', runner], {
        cwd: appRoot,
        env: process.env,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
        new Response(child.stdout).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(stderr || `Navigation timing runner exited with ${exitCode}`);
    }
    expect(exitCode).toBe(0);
}, 15_000);
