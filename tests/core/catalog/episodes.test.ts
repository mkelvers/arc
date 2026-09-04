import { describe, expect, test } from 'bun:test';

import { reconcileEpisodeMetadata } from '@arc/core';
import { episodeRevision, sourceRevision } from '@arc/core/revisions';
import type { AudioMode } from '@arc/core';

describe('episode catalog synchronization', () => {
    test('changes the page revision when synchronization state changes', () => {
        const before = episodeRevision({
            sourceRevision: 'inventory',
            mediaStatus: 'RELEASING',
            nextAiringAt: new Date('2026-09-04T14:30:00.000Z'),
            nextAiringEpisode: 8,
            lastSuccessAt: new Date('2026-08-28T15:30:24.452Z'),
        });
        const after = episodeRevision({
            sourceRevision: 'inventory',
            mediaStatus: 'RELEASING',
            nextAiringAt: new Date('2026-09-04T14:30:00.000Z'),
            nextAiringEpisode: 8,
            lastSuccessAt: new Date('2026-08-28T16:19:13.175Z'),
        });

        expect(after).not.toBe(before);
    });

    test('preserves episode ordering while normalizing audio mode ordering', () => {
        const first: Array<{
            id: string;
            number: number;
            title: string;
            audio: AudioMode[];
        }> = [
            { id: 'two', number: 2, title: 'Two', audio: ['sub'] },
            { id: 'one', number: 1, title: 'One', audio: ['dub', 'sub'] },
        ];
        const second = first.toReversed();

        expect(sourceRevision(first)).not.toBe(sourceRevision(second));
        expect(sourceRevision(first)).toBe(
            sourceRevision([
                { ...first[0], audio: ['sub'] },
                { ...first[1], audio: ['sub', 'dub'] },
            ])
        );
    });

    test('preserves metadata while enrichment is unavailable', () => {
        const result = reconcileEpisodeMetadata(
            [
                {
                    episodeId: 'episode-1',
                    number: 1,
                    metadataTitle: 'Stored title',
                    metadataTitleSource: 'tmdb',
                    imageUrl: 'stored-image',
                    runtimeMinutes: 24,
                    airDate: '08/01/2026',
                    overview: 'Stored overview',
                    overviewSource: 'tmdb',
                },
            ],
            null,
            {
                previousSourceId: 42,
                currentSourceId: null,
                previousRevision: 'tmdb-episode-v4',
            }
        );

        expect(result).toEqual([
            {
                episodeId: 'episode-1',
                metadataTitle: 'Stored title',
                metadataTitleSource: 'tmdb',
                imageUrl: 'stored-image',
                runtimeMinutes: 24,
                airDate: '08/01/2026',
                overview: 'Stored overview',
                overviewSource: 'tmdb',
            },
        ]);
    });

    test('uses the confirmed airing date without rewriting provider identity', () => {
        const result = reconcileEpisodeMetadata(
            [
                {
                    episodeId: 'provider:episode-1',
                    number: 1,
                    metadataTitle: null,
                    metadataTitleSource: null,
                    imageUrl: null,
                    runtimeMinutes: null,
                    airDate: '08/02/2026',
                    overview: null,
                    overviewSource: null,
                },
            ],
            new Map([
                [
                    'provider:episode-1',
                    {
                        title: 'Episode one',
                        titleSource: 'tmdb',
                        imageUrl: 'image',
                        runtime: 24,
                        airDate: '08/02/2026',
                        overview: 'Overview',
                        overviewSource: 'tmdb',
                    },
                ],
            ]),
            {
                previousSourceId: null,
                currentSourceId: 42,
                previousRevision: null,
                confirmedAirDates: new Map([[1, new Date('2026-08-01T16:00:00.000Z')]]),
            }
        );

        expect(result[0]).toMatchObject({
            episodeId: 'provider:episode-1',
            airDate: '08/01/2026',
            metadataTitle: 'Episode one',
        });
    });
});
