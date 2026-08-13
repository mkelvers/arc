import { describe, expect, test } from 'bun:test';

import {
    importedActivityAt,
    parseWatchlistImport,
    WatchlistImportError,
} from './watchlist-transfer';

describe('watchlist transfer', () => {
    test('parses an Arc export with both provider identities', () => {
        const [entry] = parseWatchlistImport(
            JSON.stringify({
                schema_version: '1.0',
                entries: [
                    {
                        anilist_id: 21,
                        mal_id: 21,
                        status: 'completed',
                        added_at: '2026-07-12T18:55:06.321Z',
                        updated_at: '2026-08-09T10:00:00.000Z',
                        titles: { preferred: 'ONE PIECE', romaji: 'One Piece' },
                    },
                ],
            })
        );

        expect(entry).toEqual({
            index: 0,
            anilistId: 21,
            malId: 21,
            state: 'completed',
            addedAt: new Date('2026-07-12T18:55:06.321Z'),
            updatedAt: new Date('2026-08-09T10:00:00.000Z'),
            titles: {
                preferred: 'ONE PIECE',
                english: undefined,
                romaji: 'One Piece',
                native: undefined,
            },
        });
    });

    test('maps provider hold and repeat states into Arc states', () => {
        expect(
            parseWatchlistImport(
                JSON.stringify([
                    { anilist_id: 1, status: 'PAUSED' },
                    { anilist_id: 2, status: 'on_hold' },
                    { anilist_id: 3, status: 'REPEATING' },
                ])
            ).map(({ state }) => state)
        ).toEqual(['plan_to_watch', 'plan_to_watch', 'watching']);
    });

    test('preserves JSON position as descending import activity', () => {
        const importedAt = Date.parse('2026-08-09T12:00:00.000Z');

        expect(importedActivityAt(0, importedAt)).toEqual(new Date('2026-08-09T12:00:00.000Z'));
        expect(importedActivityAt(15, importedAt)).toEqual(new Date('2026-08-09T11:59:59.985Z'));
    });

    test('rejects entries without a provider identity', () => {
        expect(() => parseWatchlistImport(JSON.stringify([{ status: 'completed' }]))).toThrow(
            WatchlistImportError
        );
    });

    test('does not impose an arbitrary entry-count limit', () => {
        const source = Array.from({ length: 501 }, (_, index) => ({
            anilist_id: index + 1,
            status: 'completed',
        }));

        expect(parseWatchlistImport(JSON.stringify(source))).toHaveLength(501);
    });
});
