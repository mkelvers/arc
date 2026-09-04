import { beforeEach, describe, expect, mock, test } from 'bun:test';

import {
    animeArtwork,
    animeArtworkSync,
    animeArtworkPreference,
    animeEpisode,
    animeRelease,
} from '@arc/shared/db/schema';
import type { AniListAnime } from '../anilist/types';
import type { StoredMapping } from './types';

type ImageRow = {
    externalIdId: number;
    type: 'backdrop' | 'logo';
    filePath: string;
    aspectRatio: number;
    height: number;
    language: string | null;
    voteAverage: number;
    width: number;
};

type SyncRow = { externalIdId: number; allLanguages: boolean };
type ReleaseRow = { format: string };
type ArtworkQuery = { include_image_language: string } | null;
type PreferenceRow = {
    backdropFilePath: string | null;
    logoFilePath: string | null;
    logoHidden: boolean;
    logoSize: number;
};
type ArtworkTable =
    | typeof animeArtwork
    | typeof animeArtworkSync
    | typeof animeArtworkPreference
    | typeof animeEpisode
    | typeof animeRelease;
type QueryRows = SyncRow[] | ImageRow[] | PreferenceRow[] | ReleaseRow[];
type PreferenceInsert = {
    externalIdId: number;
    backdropFilePath?: string | null;
    logoFilePath?: string | null;
    logoHidden?: boolean;
    logoSize?: number;
};
type InsertValues = ImageRow[] | SyncRow | SyncRow[] | PreferenceInsert;
type ArtworkPayloadImage = {
    file_path: string;
    aspect_ratio?: number;
    height?: number;
    iso_639_1?: string | null;
    vote_average?: number;
    width?: number;
};
type ArtworkPayload = {
    backdrops: ArtworkPayloadImage[];
    logos: ArtworkPayloadImage[];
};

interface TestDb {
    select(): {
        from(table: ArtworkTable): {
            where(): Promise<QueryRows> & { limit(count: number): Promise<QueryRows> };
        };
    };
    transaction(callback: (transaction: TestDb) => Promise<void>): Promise<void>;
    delete(table: ArtworkTable): { where(): Promise<void> };
    insert(table: ArtworkTable): {
        values(values: InsertValues): { onConflictDoUpdate(): Promise<void> };
    };
    update(table: typeof animeEpisode): {
        set(values: { imageUrl: string }): { where(): Promise<void> };
    };
}

const mapping: StoredMapping = {
    id: 10,
    mediaType: 'tv',
    animeId: 1,
    externalIdId: 100,
    title: 'Example anime',
    verifiedAt: null,
    mappingRevision: null,
};

const state = {
    sync: [] as SyncRow[],
    images: [] as ImageRow[],
    preference: null as PreferenceRow | null,
    payload: {
        backdrops: [],
        logos: [],
    } as ArtworkPayload,
    localizedPayload: null as ArtworkPayload | null,
    placeholderPayload: null as ArtworkPayload | null,
    fetchError: null as Error | null,
    fetchCount: 0,
    fetchQueries: [] as ArtworkQuery[],
    format: 'MOVIE',
    episodeUpdates: [] as Array<{ imageUrl: string }>,
};

function rowsFor(table: ArtworkTable): QueryRows {
    if (table === animeArtworkSync) {
        return state.sync;
    }
    if (table === animeArtwork) {
        return state.images;
    }
    if (table === animeArtworkPreference) {
        return state.preference ? [state.preference] : [];
    }
    if (table === animeRelease) {
        return [{ format: state.format }];
    }
    throw new Error('Unexpected table in artwork test database');
}

function queryRows(rows: QueryRows) {
    return Object.assign(Promise.resolve(rows), {
        limit: async (_count: number) => rows,
    });
}

const db: TestDb = {
    select() {
        return {
            from(table: ArtworkTable) {
                const rows = rowsFor(table);
                return {
                    where: () => queryRows(rows),
                };
            },
        };
    },
    transaction(callback) {
        return callback({
            ...db,
            delete: (_table) => ({
                where: async () => void (state.images = []),
            }),
            insert: (table) => ({
                values: (values) => ({
                    onConflictDoUpdate: async () => {
                        if (table === animeArtwork) {
                            state.images = values as ImageRow[];
                        } else if (table === animeArtworkSync) {
                            state.sync = (Array.isArray(values) ? values : [values]) as SyncRow[];
                        }
                    },
                }),
            }),
        });
    },
    delete: (_table) => ({
        where: async () => void (state.images = []),
    }),
    insert: (_table) => ({
        values: (_values) => ({
            onConflictDoUpdate: async () => {},
        }),
    }),
    update: (table) => ({
        set: (values) => ({
            where: async () => {
                if (table === animeEpisode) {
                    state.episodeUpdates.push(values);
                }
            },
        }),
    }),
};

mock.module('@arc/shared/db', () => ({
    db,
    excluded: () => undefined,
}));

mock.module('./client', () => ({
    create: () => ({
        GET: async (
            path: string,
            request: {
                params?: {
                    query?: ArtworkQuery;
                };
            }
        ) => {
            state.fetchCount += 1;
            state.fetchQueries.push(request.params?.query ?? null);
            if (state.fetchError) {
                throw state.fetchError;
            }
            if (
                request.params?.query?.include_image_language.includes('xx') &&
                state.placeholderPayload
            ) {
                return {
                    data: state.placeholderPayload,
                };
            }
            return {
                data: request.params?.query
                    ? (state.localizedPayload ?? state.payload)
                    : state.payload,
            };
        },
    }),
    imageUrl: (path: string) => `https://image.tmdb.org/t/p/original${path}`,
}));

mock.module('./mapping', () => ({
    NoConfidentTmdbMappingError: class NoConfidentTmdbMappingError extends Error {},
    resolveStored: async () => mapping,
}));

mock.module('./mapping-store', () => ({
    findMapping: async () => mapping,
    findArtworkMappings: async () => ({
        matches: [mapping],
        preferenceExternalIdId: mapping.externalIdId,
    }),
}));

mock.module('./poster', () => ({
    getPoster: async () => null,
    readPoster: async () => null,
}));

const { getArtwork } = await import('./artwork');
const { selectArtwork } = await import('./media');

const anime = { id: mapping.animeId } as AniListAnime;

beforeEach(() => {
    state.sync = [];
    state.images = [];
    state.preference = null;
    state.payload = { backdrops: [], logos: [] };
    state.localizedPayload = null;
    state.placeholderPayload = null;
    state.fetchError = null;
    state.fetchCount = 0;
    state.fetchQueries = [];
    state.format = 'MOVIE';
    state.episodeUpdates = [];
});

describe('TMDB anime artwork', () => {
    test('fetches and persists missing artwork during a refresh', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/backdrop.jpg',
                    width: 1920,
                    height: 1080,
                },
            ],
            logos: [
                {
                    file_path: '/logo.png',
                    width: 1000,
                    height: 300,
                },
            ],
        };

        const artwork = await getArtwork(anime, { refresh: true });

        expect(state.fetchCount).toBe(2);
        expect(state.sync).toEqual([{ externalIdId: 100, allLanguages: true }]);
        expect(state.images.map(({ filePath }) => filePath)).toEqual([
            '/backdrop.jpg',
            '/logo.png',
        ]);
        expect(artwork?.selectedBackdrop?.filePath).toBe('/backdrop.jpg');
        expect(artwork?.selectedLogo?.filePath).toBe('/logo.png');
    });

    test('requests default and unlocalized image languages from TMDB', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/backdrop.jpg',
                    width: 1920,
                    height: 1080,
                },
            ],
            logos: [],
        };

        await getArtwork(anime, { refresh: true });

        expect(state.fetchQueries).toEqual([null, { include_image_language: 'en-US,en,null,xx' }]);
    });

    test('fetches TMDB placeholder-language images added after the initial artwork sync', async () => {
        state.localizedPayload = { backdrops: [], logos: [] };
        state.placeholderPayload = {
            backdrops: [
                {
                    file_path: '/new-backdrop.jpg',
                    width: 3840,
                    height: 2160,
                },
            ],
            logos: [
                {
                    file_path: '/new-logo.png',
                    width: 512,
                    height: 114,
                },
            ],
        };

        const artwork = await getArtwork(anime, { refresh: true });

        expect(artwork?.backdrops.map(({ filePath }) => filePath)).toContain('/new-backdrop.jpg');
        expect(artwork?.logos.map(({ filePath }) => filePath)).toContain('/new-logo.png');
    });

    test('merges unfiltered and language-filtered artwork', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/unfiltered-backdrop.jpg',
                    width: 1920,
                    height: 1080,
                },
            ],
            logos: [
                {
                    file_path: '/unfiltered-logo.png',
                    width: 800,
                    height: 240,
                },
            ],
        };
        state.localizedPayload = {
            backdrops: [
                {
                    file_path: '/localized-backdrop.jpg',
                    width: 2560,
                    height: 1440,
                },
            ],
            logos: [
                {
                    file_path: '/localized-logo.png',
                    width: 1000,
                    height: 300,
                },
            ],
        };

        const artwork = await getArtwork(anime, { refresh: true });

        expect(artwork?.backdrops.map(({ filePath }) => filePath)).toEqual([
            '/unfiltered-backdrop.jpg',
            '/localized-backdrop.jpg',
        ]);
        expect(artwork?.logos.map(({ filePath }) => filePath)).toEqual([
            '/unfiltered-logo.png',
            '/localized-logo.png',
        ]);
    });

    test('fetches missing artwork during an ordinary read', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/backdrop.jpg',
                    width: 1920,
                    height: 1080,
                },
            ],
            logos: [
                {
                    file_path: '/logo.png',
                    width: 1000,
                    height: 300,
                },
            ],
        };

        const artwork = await getArtwork(anime);

        expect(state.fetchCount).toBe(2);
        expect(artwork?.selectedBackdrop?.filePath).toBe('/backdrop.jpg');
    });

    test('can skip missing artwork for an explicitly non-blocking read', async () => {
        expect(await getArtwork(anime, { fetchMissing: false })).toBeNull();
        expect(state.fetchCount).toBe(0);
    });

    test('selects the highest-resolution backdrop and logo by default', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/small-backdrop.jpg',
                    width: 1920,
                    height: 1080,
                    vote_average: 10,
                },
                {
                    file_path: '/large-backdrop.jpg',
                    width: 2560,
                    height: 1440,
                    vote_average: 1,
                },
            ],
            logos: [
                {
                    file_path: '/small-logo.png',
                    width: 800,
                    height: 240,
                    vote_average: 10,
                },
                {
                    file_path: '/large-logo.png',
                    width: 1600,
                    height: 480,
                    vote_average: 1,
                },
            ],
        };

        const artwork = await getArtwork(anime, { refresh: true });

        expect(artwork?.selectedBackdrop?.filePath).toBe('/large-backdrop.jpg');
        expect(artwork?.selectedLogo?.filePath).toBe('/large-logo.png');
    });

    test('uses vote average and file path to break equal-area ties', async () => {
        state.payload = {
            backdrops: [
                {
                    file_path: '/path-z.jpg',
                    width: 100,
                    height: 100,
                    vote_average: 7,
                },
                {
                    file_path: '/path-a.jpg',
                    width: 100,
                    height: 100,
                    vote_average: 7,
                },
                {
                    file_path: '/vote-winner.jpg',
                    width: 100,
                    height: 100,
                    vote_average: 8,
                },
            ],
            logos: [],
        };

        const artwork = await getArtwork(anime, { refresh: true });

        expect(artwork?.selectedBackdrop?.filePath).toBe('/vote-winner.jpg');

        state.payload.backdrops = state.payload.backdrops.slice(0, 2).map((image) => ({
            ...image,
            vote_average: 7,
        }));
        state.sync = [];
        state.images = [];

        const tiedArtwork = await getArtwork(anime, { refresh: true });
        expect(tiedArtwork?.selectedBackdrop?.filePath).toBe('/path-a.jpg');
    });

    test('keeps saved backdrop and logo preferences authoritative', async () => {
        state.sync = [{ externalIdId: 100, allLanguages: true }];
        state.images = [
            {
                externalIdId: 100,
                type: 'backdrop',
                filePath: '/automatic-backdrop.jpg',
                aspectRatio: 16 / 9,
                height: 1080,
                language: null,
                voteAverage: 10,
                width: 1920,
            },
            {
                externalIdId: 100,
                type: 'backdrop',
                filePath: '/saved-backdrop.jpg',
                aspectRatio: 16 / 9,
                height: 720,
                language: null,
                voteAverage: 1,
                width: 1280,
            },
            {
                externalIdId: 100,
                type: 'logo',
                filePath: '/automatic-logo.png',
                aspectRatio: 4,
                height: 400,
                language: null,
                voteAverage: 10,
                width: 1600,
            },
            {
                externalIdId: 100,
                type: 'logo',
                filePath: '/saved-logo.png',
                aspectRatio: 4,
                height: 200,
                language: null,
                voteAverage: 1,
                width: 800,
            },
        ];
        state.preference = {
            backdropFilePath: '/saved-backdrop.jpg',
            logoFilePath: '/saved-logo.png',
            logoHidden: false,
            logoSize: 140,
        };

        const artwork = await getArtwork(anime);

        expect(artwork?.selectedBackdrop?.filePath).toBe('/saved-backdrop.jpg');
        expect(artwork?.selectedLogo?.filePath).toBe('/saved-logo.png');
        expect(artwork?.logoSize).toBe(140);
        expect(state.fetchCount).toBe(0);
    });

    test('isolates artwork fetch failures so the import can continue', async () => {
        state.fetchError = new Error('TMDB unavailable');

        expect(await getArtwork(anime, { refresh: true })).toBeNull();
    });

    test('updates movie episode fallback artwork when selecting a backdrop', async () => {
        state.sync = [{ externalIdId: 100, allLanguages: true }];
        state.images = [
            {
                externalIdId: 100,
                type: 'backdrop',
                filePath: '/selected-backdrop.jpg',
                aspectRatio: 16 / 9,
                height: 1080,
                language: null,
                voteAverage: 8,
                width: 1920,
            },
        ];

        await selectArtwork(164, 'backdrop', '/selected-backdrop.jpg');

        expect(state.episodeUpdates).toEqual([
            { imageUrl: 'https://image.tmdb.org/t/p/original/selected-backdrop.jpg' },
        ]);
    });

    test('does not replace TV episode artwork when selecting a backdrop', async () => {
        state.format = 'TV';
        state.sync = [{ externalIdId: 100, allLanguages: true }];
        state.images = [
            {
                externalIdId: 100,
                type: 'backdrop',
                filePath: '/selected-backdrop.jpg',
                aspectRatio: 16 / 9,
                height: 1080,
                language: null,
                voteAverage: 8,
                width: 1920,
            },
        ];

        await selectArtwork(164, 'backdrop', '/selected-backdrop.jpg');

        expect(state.episodeUpdates).toHaveLength(0);
    });
});
