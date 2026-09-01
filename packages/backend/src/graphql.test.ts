import { describe, expect, test } from 'bun:test';

import { graphql, GraphQLRequestError } from './graphql';

interface Result {
    viewer: { id: number };
}

const document = {
    toString: () => 'query Viewer { viewer { id } }',
} as Parameters<typeof graphql<Result, Record<string, never>>>[1];

describe('GraphQL requests', () => {
    test('returns data from a valid response', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () =>
                Response.json({
                    data: {
                        viewer: {
                            id: 42,
                        },
                    },
                }),
        });

        try {
            expect(graphql(server.url.href, document, {})).resolves.toEqual({
                viewer: {
                    id: 42,
                },
            });
        } finally {
            await server.stop(true);
        }
    });

    test('preserves GraphQL errors ahead of the HTTP status', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () =>
                Response.json(
                    {
                        errors: [
                            {
                                message: 'Rate limited',
                                status: 429,
                            },
                        ],
                    },
                    {
                        status: 503,
                    }
                ),
        });

        try {
            const request = graphql(server.url.href, document, {});

            expect(request).rejects.toBeInstanceOf(GraphQLRequestError);
            expect(request).rejects.toMatchObject({ message: 'Rate limited', status: 429 });
        } finally {
            await server.stop(true);
        }
    });

    test('preserves the provider retry window from a rate-limited response', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () =>
                Response.json(
                    {
                        errors: [
                            {
                                message: 'Rate limited',
                                status: 429,
                            },
                        ],
                    },
                    {
                        status: 429,
                        headers: {
                            'Retry-After': '45',
                        },
                    }
                ),
        });

        try {
            expect(graphql(server.url.href, document, {})).rejects.toMatchObject({
                status: 429,
                retryAfterMs: 45_000,
            });
        } finally {
            await server.stop(true);
        }
    });

    test('retries a bounded number of transient failures', async () => {
        let attempts = 0;
        const server = Bun.serve({
            port: 0,
            fetch: () => {
                attempts += 1;
                return attempts === 1
                    ? Response.json({
                          errors: [
                              {
                                  message: 'Rate limited',
                                  status: 429,
                              },
                          ],
                      })
                    : Response.json({
                          data: {
                              viewer: {
                                  id: 42,
                              },
                          },
                      });
            },
        });

        try {
            expect(graphql(server.url.href, document, {}, { retries: 1 })).resolves.toEqual({
                viewer: {
                    id: 42,
                },
            });
            expect(attempts).toBe(2);
        } finally {
            await server.stop(true);
        }
    });

    test('reports a bounded preview for a non-JSON upstream error', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () =>
                new Response('<html>Unavailable</html>', {
                    status: 502,
                }),
        });

        try {
            expect(graphql(server.url.href, document, {})).rejects.toMatchObject({
                message: 'The GraphQL endpoint returned 502: <html>Unavailable</html>',
                status: 502,
            });
        } finally {
            await server.stop(true);
        }
    });

    test('rejects successful responses without data', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () => Response.json({}),
        });

        try {
            expect(graphql(server.url.href, document, {})).rejects.toMatchObject({
                message: 'The GraphQL endpoint returned no data',
            });
        } finally {
            await server.stop(true);
        }
    });
});
