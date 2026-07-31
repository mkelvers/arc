import { describe, expect, test } from 'bun:test';

import {
    parseWatchlistImport,
    WatchlistImportError,
} from './transfer';

describe('parseWatchlistImport', () => {
    test('accepts the legacy MAL export contract', () => {
        const entries = parseWatchlistImport(
            JSON.stringify({
                schema_version: '1.0',
                entries: [
                    {
                        mal_id: 53802,
                        status: 'plan_to_watch',
                        added_at: '2026-07-12T18:55:06.321Z',
                        titles: {
                            preferred: '2.5 Dimensional Seduction',
                            original: '2.5 Jigen no Ririsa',
                        },
                    },
                ],
            }),
        );

        expect(entries).toEqual([
            {
                index: 0,
                malId: 53802,
                addedAt: new Date('2026-07-12T18:55:06.321Z'),
                state: 'plan_to_watch',
                titles: {
                    preferred: '2.5 Dimensional Seduction',
                    original: '2.5 Jigen no Ririsa',
                    english: undefined,
                    japanese: undefined,
                    romaji: undefined,
                    native: undefined,
                },
                anilistId: undefined,
            },
        ]);
    });

    test('accepts AniList entries and maps an unsupported hold state safely', () => {
        const entries = parseWatchlistImport(
            JSON.stringify([
                {
                    anilist_id: 21,
                    status: 'on_hold',
                    title: 'One Piece',
                },
            ]),
        );

        expect(entries[0]).toMatchObject({
            anilistId: 21,
            state: 'plan_to_watch',
            titles: { preferred: 'One Piece' },
        });
    });

    test('rejects entries without an identity', () => {
        expect(() =>
            parseWatchlistImport(
                JSON.stringify([{ status: 'completed' }]),
            ),
        ).toThrow(WatchlistImportError);
    });

    test('does not impose an arbitrary watchlist entry cap', () => {
        const source = Array.from({ length: 501 }, (_, index) => ({
            anilist_id: index + 1,
            status: 'completed',
        }));

        expect(parseWatchlistImport(JSON.stringify(source))).toHaveLength(
            501,
        );
    });
});
