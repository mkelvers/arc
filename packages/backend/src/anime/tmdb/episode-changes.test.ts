import { describe, expect, test } from 'bun:test';

import { getEpisodeChanges } from './episode-changes';

describe('TMDB episode changes', () => {
    test('uses an end boundary that includes changes from the requested date', async () => {
        const previousToken = process.env.TMDB_READ_ACCESS_TOKEN;
        process.env.TMDB_READ_ACCESS_TOKEN = 'test-token';
        let requestedUrl = '';
        try {
            const changes = await getEpisodeChanges(7451662, '2000-01-01', async (input) => {
                requestedUrl = String(input);
                return new Response(
                    JSON.stringify({
                        changes: [
                            {
                                key: 'name',
                                items: [
                                    {
                                        iso_639_1: 'en',
                                        iso_3166_1: 'US',
                                        value: 'Touch ~ 100 Things I Want to Draw for Manga!!!',
                                    },
                                ],
                            },
                            {
                                key: 'overview',
                                items: [
                                    {
                                        iso_639_1: 'en',
                                        iso_3166_1: 'US',
                                        value: 'The Manga Research Club explores the island of Oshima.',
                                    },
                                ],
                            },
                        ],
                    })
                );
            });

            const query = new URL(requestedUrl).searchParams;
            const start = Date.parse(`${query.get('start_date')}T00:00:00Z`);
            const end = Date.parse(`${query.get('end_date')}T00:00:00Z`);

            expect(end - start).toBe(16 * 86_400_000);
            expect(changes).toEqual({
                name: 'Touch ~ 100 Things I Want to Draw for Manga!!!',
                overview: 'The Manga Research Club explores the island of Oshima.',
                runtime: null,
                stillPath: null,
            });
        } finally {
            if (previousToken === undefined) {
                delete process.env.TMDB_READ_ACCESS_TOKEN;
            } else {
                process.env.TMDB_READ_ACCESS_TOKEN = previousToken;
            }
        }
    });
});
