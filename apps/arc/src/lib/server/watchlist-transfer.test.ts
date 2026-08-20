import { describe, expect, test } from 'bun:test';

import {
    importedActivityAt,
    parseCsvWatchlist,
    parseJsonWatchlist,
    parseWatchlistImport,
    parseXmlWatchlist,
    WatchlistImportError,
} from './watchlist-transfer';

describe('watchlist transfer', () => {
    test('parses Arc JSON and retains provider identities and activity times', () => {
        const [entry] = parseJsonWatchlist(
            JSON.stringify({
                entries: [
                    {
                        anilist_id: 21,
                        mal_id: 21,
                        status: 'completed',
                        added_at: '2026-07-12T18:55:06.321Z',
                        updated_at: '2026-08-13T20:14:02.123Z',
                        titles: { preferred: 'ONE PIECE', romaji: 'One Piece' },
                    },
                ],
            })
        );

        expect(entry).toEqual({
            index: 0,
            anilistId: 21,
            malId: 21,
            genericId: undefined,
            state: 'completed',
            addedAt: new Date('2026-07-12T18:55:06.321Z'),
            activityAt: new Date('2026-08-13T20:14:02.123Z'),
            titles: {
                preferred: 'ONE PIECE',
                english: undefined,
                romaji: 'One Piece',
                native: undefined,
            },
        });
    });

    test('accepts a title without an ID and maps common status names', () => {
        expect(
            parseJsonWatchlist(
                JSON.stringify([
                    { title: 'Frieren', status: 'CURRENT' },
                    { title: 'Haibane Renmei', status: 'on hold' },
                ])
            ).map(({ state }) => state)
        ).toEqual(['watching', 'plan_to_watch']);
    });

    test('parses quoted CSV titles containing commas and quotes', () => {
        const [entry] = parseCsvWatchlist(
            'id,title,status\r\n42,"Kaguya-sama: Love Is War, ""Ultra Romantic""",completed\r\n'
        );

        expect(entry.genericId).toBe(42);
        expect(entry.titles.preferred).toBe('Kaguya-sama: Love Is War, "Ultra Romantic"');
        expect(entry.state).toBe('completed');
    });

    test('parses generic XML and MyAnimeList XML fields', () => {
        const entries = parseXmlWatchlist(`<?xml version="1.0"?>
            <watchlist>
                <entry><title>Odd Taxi</title><status>dropped</status></entry>
                <anime>
                    <series_animedb_id>5114</series_animedb_id>
                    <series_title>Fullmetal Alchemist: Brotherhood</series_title>
                    <my_status>Completed</my_status>
                </anime>
            </watchlist>`);

        expect(entries.map(({ malId, state, titles }) => [malId, state, titles.preferred])).toEqual(
            [
                [undefined, 'dropped', 'Odd Taxi'],
                [5114, 'completed', 'Fullmetal Alchemist: Brotherhood'],
            ]
        );
    });

    test('detects a format when the file has no extension', () => {
        expect(parseWatchlistImport('title,status\nMonster,completed')).toHaveLength(1);
        expect(
            parseWatchlistImport('<watchlist><anime id="1" status="watching" /></watchlist>')
        ).toHaveLength(1);
    });

    test('uses source activity time before the newest-first file position fallback', () => {
        const importedAt = Date.parse('2026-08-20T12:00:00.000Z');
        const sourceActivityAt = new Date('2026-08-10T18:00:00.000Z');

        expect(importedActivityAt(0, importedAt)).toEqual(new Date(importedAt));
        expect(importedActivityAt(15, importedAt)).toEqual(new Date(importedAt - 15));
        expect(importedActivityAt(15, importedAt, sourceActivityAt)).toEqual(sourceActivityAt);
    });

    test('accepts Unix-second activity timestamps from AniList-shaped JSON', () => {
        const [entry] = parseJsonWatchlist(
            JSON.stringify([{ id: 180812, status: 'CURRENT', updatedAt: 1_786_384_800 }])
        );

        expect(entry.activityAt).toEqual(new Date(1_786_384_800_000));
    });

    test('orders imported entries by source activity instead of array position', () => {
        const entries = parseJsonWatchlist(
            JSON.stringify([
                { id: 20829, status: 'completed', updatedAt: 1_786_384_800 },
                { id: 202269, status: 'planning', updatedAt: 1_786_384_801 },
                { id: 180812, status: 'watching', updatedAt: 1_786_384_802 },
            ])
        );

        expect(
            entries
                .toSorted(
                    (left, right) =>
                        (right.activityAt?.getTime() ?? 0) - (left.activityAt?.getTime() ?? 0)
                )
                .map(({ genericId }) => genericId)
        ).toEqual([180812, 202269, 20829]);
    });

    test('rejects entries without an ID, title, or supported status', () => {
        expect(() => parseJsonWatchlist(JSON.stringify([{ status: 'completed' }]))).toThrow(
            WatchlistImportError
        );
        expect(() =>
            parseJsonWatchlist(JSON.stringify([{ title: 'Monster', status: 'paused forever' }]))
        ).toThrow(WatchlistImportError);
    });
});
