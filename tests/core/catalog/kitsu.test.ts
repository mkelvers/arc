import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { requestKitsu } from '../../../packages/core/src/catalog/kitsu';
import { kitsuFixture } from './fixtures/kitsu';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('resolves MAL IDs into AniList route IDs without contacting AniList', async () => {
    const fixture = kitsuFixture();
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', ({ request }) => {
            expect(new URL(request.url).searchParams.get('filter[externalSite]')).toBe(
                'myanimelist/anime'
            );
            return HttpResponse.json(fixture.mappings);
        }),
        http.get('https://kitsu.app/api/edge/anime', () => HttpResponse.json(fixture.anime))
    );
    expect(await requestKitsu('WatchlistTransferAnime', { malIds: [59970] })).toMatchObject({
        mal: { media: [{ id: 182205, idMal: 59970, metadataSourceId: 49235 }] },
    });
});

test('rejects ambiguous mappings instead of routing to an arbitrary release', async () => {
    const fixture = kitsuFixture();
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () =>
            HttpResponse.json({
                data: [
                    ...fixture.mappings.data,
                    {
                        ...fixture.mappings.data[0],
                        id: '99',
                        relationships: { item: { data: { type: 'anime', id: '123' } } },
                    },
                ],
            })
        )
    );
    await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow('unambiguous');
});

test('requires agreement with the reverse AniList mapping', async () => {
    const fixture = kitsuFixture();
    const wrong = kitsuFixture('49235', 12345);
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () => HttpResponse.json(fixture.mappings)),
        http.get('https://kitsu.app/api/edge/anime', () => HttpResponse.json(wrong.anime))
    );
    await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow('conflicting metadata');
});

test('does not treat a missing mapping as a successful empty ID batch', async () => {
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () => HttpResponse.json({ data: [] }))
    );
    await expect(requestKitsu('WatchlistAnime', { ids: [182205] })).rejects.toThrow('unambiguous');
});

test('resolves related releases in a batch using their AniList and MAL mappings', async () => {
    const fixture = kitsuFixture();
    const destination = kitsuFixture('42059', 106625, 38883);
    const relation = {
        id: '900',
        type: 'mediaRelationships',
        attributes: { role: 'prequel' },
        relationships: { destination: { data: { type: 'anime', id: '42059' } } },
    };
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () => HttpResponse.json(fixture.mappings)),
        http.get('https://kitsu.app/api/edge/anime', ({ request }) => {
            if (new URL(request.url).searchParams.get('filter[id]') === '42059')
                return HttpResponse.json(destination.anime);
            return HttpResponse.json({
                data: [
                    {
                        ...fixture.anime.data[0],
                        relationships: {
                            ...fixture.anime.data[0]!.relationships,
                            mediaRelationships: {
                                data: [{ type: relation.type, id: relation.id }],
                            },
                        },
                    },
                ],
                included: [
                    ...fixture.anime.included,
                    relation,
                    { ...destination.anime.data[0], relationships: {} },
                ],
            });
        })
    );
    expect(await requestKitsu('Anime', { id: 182205 })).toMatchObject({
        Media: {
            relations: { edges: [{ relationType: 'PREQUEL', node: { id: 106625, idMal: 38883 } }] },
        },
    });
});

test('keeps upstream pagination when unsafe and unmapped search results are omitted', async () => {
    const safe = kitsuFixture();
    const adult = kitsuFixture('2', 2, 2);
    adult.anime.data[0]!.attributes.nsfw = true;
    server.use(
        http.get('https://kitsu.app/api/edge/anime', ({ request }) => {
            const url = new URL(request.url);
            expect(url.searchParams.get('page[offset]')).toBe('3');
            expect(url.searchParams.get('filter[text]')).toBe('slime');
            return HttpResponse.json({
                data: [
                    ...safe.anime.data,
                    ...adult.anime.data,
                    { ...safe.anime.data[0], id: '999', relationships: {} },
                ],
                included: [...safe.anime.included, ...adult.anime.included],
                links: { next: 'https://untrusted.example/never-follow-this' },
            });
        })
    );
    const result = await requestKitsu('BrowseAnimePage', {
        search: 'slime',
        isAdult: false,
        page: 2,
        perPage: 3,
    });
    expect(result).toMatchObject({
        Page: { media: [{ id: 182205 }], pageInfo: { hasNextPage: true } },
    });
});

test('translates 50-item pages to Kitsu offsets without losing rows', async () => {
    const offsets: number[] = [];
    server.use(
        http.get('https://kitsu.app/api/edge/anime', ({ request }) => {
            const url = new URL(request.url);
            const offset = Number(url.searchParams.get('page[offset]'));
            const limit = Number(url.searchParams.get('page[limit]'));
            offsets.push(offset);
            expect(limit).toBeLessThanOrEqual(20);
            const fixtures = Array.from({ length: limit }, (_, index) =>
                kitsuFixture(
                    String(offset + index + 1),
                    offset + index + 1000,
                    offset + index + 2000
                )
            );
            return HttpResponse.json({
                data: fixtures.flatMap((fixture) => fixture.anime.data),
                included: fixtures.flatMap((fixture) => fixture.anime.included),
                links: { next: '/next' },
            });
        })
    );
    const result = await requestKitsu('SearchAnimePage', { search: 'anime', page: 2, perPage: 50 });
    expect(offsets).toEqual([50, 70, 90]);
    expect(result.Page?.media).toHaveLength(50);
});

test('rejects malformed metadata and missing included resources', async () => {
    const fixture = kitsuFixture();
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () => HttpResponse.json(fixture.mappings)),
        http.get('https://kitsu.app/api/edge/anime', () =>
            HttpResponse.json({
                ...fixture.anime,
                data: [
                    {
                        ...fixture.anime.data[0],
                        relationships: {
                            ...fixture.anime.data[0]!.relationships,
                            genres: { data: [{ type: 'genres', id: '404' }] },
                        },
                    },
                ],
                included: [],
            })
        )
    );
    await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow('omitted included');
    server.use(
        http.get('https://kitsu.app/api/edge/anime', () =>
            HttpResponse.json({
                data: [{ ...fixture.anime.data[0], attributes: { canonicalTitle: 'Invalid' } }],
                included: fixture.anime.included,
            })
        )
    );
    await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow();
});

test('bounds hung requests across the entire fallback', async () => {
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return HttpResponse.json({ data: [] });
        })
    );
    await expect(requestKitsu('Anime', { id: 182205 }, 5)).rejects.toThrow();
});

test('refuses AniList-only features without making misleading substitute requests', async () => {
    for (const operation of [
        'AnimeSchedule',
        'AiringAnimePage',
        'ReleaseCalendarPage',
        'RecentAiringPage',
        'BrowseAnimeTaxonomy',
        'HomeHeroCandidates',
    ]) {
        await expect(requestKitsu(operation, {})).rejects.toThrow('cannot faithfully answer');
    }
    await expect(requestKitsu('BrowseAnimePage', { source: 'MANGA' })).rejects.toThrow(
        'cannot apply'
    );
    await expect(requestKitsu('BrowseAnimePage', { format: 'TV_SHORT' })).rejects.toThrow(
        'cannot apply'
    );
});

test('honors Kitsu Retry-After across separate fallback operations', async () => {
    const now = Date.now();
    const time = spyOn(Date, 'now').mockReturnValue(now);
    let calls = 0;
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', () => {
            calls++;
            return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '2' } });
        })
    );
    try {
        await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow('429');
        await expect(requestKitsu('AnimeOverview', { id: 182205 })).rejects.toThrow('rate limited');
        expect(calls).toBe(1);
        time.mockReturnValue(now + 2001);
        server.use(
            http.get('https://kitsu.app/api/edge/mappings', () => HttpResponse.json({ data: [] }))
        );
        await expect(requestKitsu('Anime', { id: 182205 })).rejects.toThrow('unambiguous');
    } finally {
        time.mockRestore();
    }
});
