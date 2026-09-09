import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
    AnimeDocument,
    AnimeScheduleDocument,
    AnimeOverviewDocument,
} from '@arc/shared/graphql/generated/graphql';
import { kitsuFixture } from './fixtures/kitsu';
import { toAnimeDetails } from '../../../packages/core/src/catalog/details';
import { AniListAnimeOverviewSchema } from '../../../packages/core/src/catalog/anilist-types';
import { animeRelease, providerSnapshot, type anilistQuerySnapshot } from '@arc/shared/db/schema';
import {
    AniListAnimeSchema,
    type AniListAnime,
} from '../../../packages/core/src/catalog/anilist-types';

type SnapshotData = { Media: { id: number } | null };
type Snapshot = {
    key: string;
    data: SnapshotData;
    fetchedAt: Date;
    refreshAfter: Date;
};
const snapshots: Snapshot[] = [];
let storedSnapshots: Snapshot[] = [];
let storedRelease: AniListAnime | null = null;
type SourceRow = {
    provider: string;
    payload: AniListAnime;
    sourceFetchedAt: Date;
};
let storedSourceRows: SourceRow[] = [];
type ReleaseRow = { data: AniListAnime };
type QueryRow = Snapshot | SourceRow | ReleaseRow;
type MockTable = typeof animeRelease | typeof providerSnapshot | typeof anilistQuerySnapshot;
type MockInsert = {
    provider?: string;
    payload?: AniListAnime;
    sourceFetchedAt?: Date;
    key?: string;
    data?: SnapshotData;
    fetchedAt?: Date;
    refreshAfter?: Date;
};

function queryRows(rows: QueryRow[]) {
    const query = Promise.resolve(rows);
    return Object.assign(query, { limit: async () => rows });
}

const transaction = {
    execute: async () => {},
    select: () => ({
        from: (table: MockTable) => ({
            where: () =>
                queryRows(
                    table === animeRelease
                        ? storedRelease
                            ? [{ data: storedRelease }]
                            : []
                        : table === providerSnapshot
                          ? storedSourceRows
                          : storedSnapshots
                ),
        }),
    }),
    insert: (table: MockTable) => ({
        values: (value: MockInsert) => ({
            onConflictDoUpdate: async () => {
                if (
                    table === providerSnapshot &&
                    value.provider &&
                    value.payload &&
                    value.sourceFetchedAt
                ) {
                    storedSourceRows = [
                        ...storedSourceRows.filter((row) => row.provider !== value.provider),
                        {
                            provider: value.provider,
                            payload: value.payload,
                            sourceFetchedAt: value.sourceFetchedAt,
                        },
                    ];
                } else {
                    snapshots.push({
                        key: value.key ?? 'stored',
                        data: value.data ?? { Media: null },
                        fetchedAt: value.fetchedAt ?? new Date(),
                        refreshAfter: value.refreshAfter ?? new Date(),
                    });
                }
            },
            onConflictDoNothing: async () => {
                if (
                    table === providerSnapshot &&
                    value.provider &&
                    value.payload &&
                    value.sourceFetchedAt
                ) {
                    storedSourceRows.push({
                        provider: value.provider,
                        payload: value.payload,
                        sourceFetchedAt: value.sourceFetchedAt,
                    });
                }
            },
        }),
    }),
    delete: () => ({ where: async () => {} }),
};
mock.module('@arc/shared/db', () => ({
    db: {
        ...transaction,
        transaction: async <Result>(run: (tx: typeof transaction) => Promise<Result>) =>
            run(transaction),
    },
}));
mock.module('../../../packages/core/src/catalog/anilist-lease', () => ({
    coordinatedAniListRequest: <Result>(_operation: string, run: () => Promise<Result>) => run(),
}));
mock.module('../../../packages/core/src/catalog/identity', () => ({
    findInternalAnimeId: async () => null,
    ensureInternalAnimeId: async () => 1,
}));
const { request } = await import('../../../packages/core/src/catalog/anilist-client');
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
    server.resetHandlers();
    snapshots.length = 0;
    storedSnapshots = [];
    storedRelease = null;
    storedSourceRows = [];
});
afterAll(() => server.close());

const fixture = kitsuFixture();
let kitsuRequests = 0;
function installKitsu() {
    kitsuRequests = 0;
    server.use(
        http.get('https://kitsu.app/api/edge/mappings', ({ request }) => {
            kitsuRequests++;
            expect(new URL(request.url).searchParams.get('include')).toBe('item');
            return HttpResponse.json(fixture.mappings);
        }),
        http.get('https://kitsu.app/api/edge/anime', () => {
            kitsuRequests++;
            return HttpResponse.json(fixture.anime);
        })
    );
}

for (const status of [408, 429, 500, 502, 503, 504]) {
    test(`returns Kitsu after AniList ${status} without caching it as AniList`, async () => {
        installKitsu();
        server.use(
            http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status }))
        );
        const result = await request(AnimeDocument, { id: 182205 }, { forceRefresh: true });
        expect(result.Media).toMatchObject({
            id: 182205,
            idMal: 59970,
            episodes: 24,
            metadataSource: 'kitsu',
        });
        expect(kitsuRequests).toBe(2);
        expect(snapshots).toHaveLength(0);
    });
}

test('falls back on network failure and malformed successful responses', async () => {
    installKitsu();
    server.use(http.post('https://graphql.anilist.co', () => HttpResponse.error()));
    expect((await request(AnimeDocument, { id: 182205 })).Media?.id).toBe(182205);
    server.use(
        http.post('https://graphql.anilist.co', () =>
            HttpResponse.json({ data: { Media: { id: 999 } } })
        )
    );
    expect((await request(AnimeDocument, { id: 182205 })).Media?.id).toBe(182205);
});

test('falls back for the observed AniList outage even though it uses HTTP 403', async () => {
    installKitsu();
    server.use(
        http.post('https://graphql.anilist.co', () =>
            HttpResponse.json(
                {
                    errors: [
                        {
                            status: 403,
                            message:
                                'The AniList API has been temporarily disabled due to severe stability issues.',
                        },
                    ],
                    data: null,
                },
                { status: 403 }
            )
        )
    );
    expect((await request(AnimeDocument, { id: 182205 })).Media?.id).toBe(182205);
    expect(kitsuRequests).toBe(2);
});

for (const status of [400, 401, 403, 404]) {
    test(`preserves authoritative AniList ${status} without calling Kitsu`, async () => {
        installKitsu();
        server.use(
            http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status }))
        );
        await expect(request(AnimeDocument, { id: 182205 })).rejects.toMatchObject({ status });
        expect(kitsuRequests).toBe(0);
    });
}

test('does not fall back for a successful missing title and stores the primary snapshot', async () => {
    installKitsu();
    server.use(
        http.post('https://graphql.anilist.co', () => HttpResponse.json({ data: { Media: null } }))
    );
    expect(await request(AnimeDocument, { id: 182205 })).toEqual({ Media: null });
    expect(kitsuRequests).toBe(0);
    expect(snapshots).toHaveLength(1);
});

test('preserves Retry-After when both providers fail', async () => {
    server.use(
        http.post('https://graphql.anilist.co', () =>
            HttpResponse.json(
                { errors: [{ message: 'Rate limited', status: 429 }] },
                { status: 429, headers: { 'Retry-After': '45' } }
            )
        ),
        http.get(
            'https://kitsu.app/api/edge/mappings',
            () => new HttpResponse(null, { status: 503 })
        )
    );
    await expect(request(AnimeDocument, { id: 182205 })).rejects.toMatchObject({
        status: 429,
        retryAfterMs: 45000,
    });
});

test('does not replace an exact airing schedule with an invented Kitsu event', async () => {
    installKitsu();
    server.use(
        http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status: 503 }))
    );
    await expect(request(AnimeScheduleDocument, { id: 182205 })).rejects.toMatchObject({
        status: 503,
    });
    expect(kitsuRequests).toBe(0);
});

test('carries Kitsu score provenance through overview parsing and page details', async () => {
    installKitsu();
    server.use(
        http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status: 503 }))
    );
    const response = await request(AnimeOverviewDocument, { id: 182205 });
    const overview = AniListAnimeOverviewSchema.parse(response.Media);
    expect(toAnimeDetails(overview)).toMatchObject({
        score: 82.44,
        scoreSource: 'Kitsu',
        nextAiringEpisode: null,
    });
});

test('keeps the stale AniList snapshot when both providers fail', async () => {
    storedSnapshots = [
        {
            key: 'stored',
            data: { Media: { id: 182205 } },
            fetchedAt: new Date(0),
            refreshAfter: new Date(0),
        },
    ];
    server.use(
        http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status: 503 })),
        http.get(
            'https://kitsu.app/api/edge/mappings',
            () => new HttpResponse(null, { status: 503 })
        )
    );
    expect(await request(AnimeDocument, { id: 182205 })).toMatchObject({ Media: { id: 182205 } });
    expect(snapshots).toHaveLength(0);
});

test('does not overwrite a stored AniList release or schedule with partial fallback data', async () => {
    installKitsu();
    server.use(
        http.post('https://graphql.anilist.co', () => new HttpResponse(null, { status: 503 }))
    );
    const fallback = AniListAnimeSchema.parse((await request(AnimeDocument, { id: 182205 })).Media);
    storedRelease = {
        ...fallback,
        metadataSource: undefined,
        metadataSourceId: undefined,
        nextAiringEpisode: { episode: 22, airingAt: 1800000000 },
    };
    const { storeAnimeRelease } =
        await import('../../../packages/core/src/catalog/anilist-release');
    await storeAnimeRelease(fallback);
    expect(storedSourceRows.map(({ provider }) => provider)).toEqual(['anilist', 'kitsu']);
    expect(storedRelease.nextAiringEpisode).toEqual({ episode: 22, airingAt: 1800000000 });
});
