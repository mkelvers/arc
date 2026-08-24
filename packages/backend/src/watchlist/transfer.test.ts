import { describe, expect, test } from 'bun:test';

import {
    importedActivityAt,
    parseCsvWatchlist,
    parseJsonWatchlist,
    parseWatchlistImport,
    WatchlistImportError,
} from './transfer';

describe('watchlist transfer', () => {
    test('retains provider identities and source activity times from JSON', () => {
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

    test('maps common status names', () => {
        expect(
            parseJsonWatchlist(
                JSON.stringify([
                    { title: 'Frieren', status: 'CURRENT' },
                    { title: 'Haibane Renmei', status: 'on hold' },
                ])
            ).map(({ state }) => state)
        ).toEqual(['watching', 'plan_to_watch']);
    });

    test('parses quoted CSV titles', () => {
        const [entry] = parseCsvWatchlist(
            'id,title,status\r\n42,"Kaguya-sama: Love Is War, ""Ultra Romantic""",completed\r\n'
        );
        expect(entry.genericId).toBe(42);
        expect(entry.titles.preferred).toBe('Kaguya-sama: Love Is War, "Ultra Romantic"');
    });

    test('detects formats without an extension', () => {
        expect(parseWatchlistImport('title,status\nMonster,completed')).toHaveLength(1);
        expect(parseWatchlistImport('[{"id": 1, "status": "watching"}]')).toHaveLength(1);
    });

    test('rejects XML files', () => {
        expect(() =>
            parseWatchlistImport(
                '<watchlist><anime id="1" status="watching" /></watchlist>',
                'watchlist.xml'
            )
        ).toThrow('Choose a JSON or CSV watchlist file.');
    });

    test('prefers source activity time to file position', () => {
        const importedAt = Date.parse('2026-08-20T12:00:00.000Z');
        const source = new Date('2026-08-10T18:00:00.000Z');
        expect(importedActivityAt(15, importedAt)).toEqual(new Date(importedAt - 15));
        expect(importedActivityAt(15, importedAt, source)).toEqual(source);
    });

    test('accepts Unix-second activity timestamps', () => {
        const [entry] = parseJsonWatchlist(
            JSON.stringify([{ id: 180812, status: 'CURRENT', updatedAt: 1_786_384_800 }])
        );
        expect(entry.activityAt).toEqual(new Date(1_786_384_800_000));
    });

    test('rejects missing identities and unsupported statuses', () => {
        expect(() => parseJsonWatchlist(JSON.stringify([{ status: 'completed' }]))).toThrow(
            WatchlistImportError
        );
        expect(() =>
            parseJsonWatchlist(JSON.stringify([{ title: 'Monster', status: 'paused forever' }]))
        ).toThrow(WatchlistImportError);
    });
});
