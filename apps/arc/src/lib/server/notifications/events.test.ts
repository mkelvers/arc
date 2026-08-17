import { describe, expect, test } from 'bun:test';

import {
    notificationInputsForInitialAvailability,
    notificationInputsForTransitions,
} from './events';

const recipient = { userId: 'user-1', sourceAnilistId: 10 };

describe('notification event identity', () => {
    test('turns the first playable sequel episode into one season notification', () => {
        const observedAt = new Date('2026-08-12T12:00:00.000Z');
        const [input] = notificationInputsForTransitions(
            20,
            'Sequel',
            [recipient],
            [
                {
                    episodeId: 'episode-1',
                    number: 1,
                    airDate: null,
                    kind: 'episode_available',
                    audio: ['sub'],
                    observedAt,
                },
            ]
        );

        expect(input).toEqual({
            userId: 'user-1',
            kind: 'season_available',
            anilistId: 20,
            sourceAnilistId: 10,
            title: 'Sequel',
            episodeId: 'episode-1',
            episodeNumber: 1,
            audio: ['sub'],
            dedupeKey: 'season_available:20',
            occurredAt: observedAt,
        });
    });

    test('deduplicates an episode independently from a later dub', () => {
        const inputs = notificationInputsForTransitions(
            10,
            'Anime',
            [recipient],
            [
                {
                    episodeId: 'episode-7',
                    number: 7,
                    airDate: '2026-08-10',
                    kind: 'episode_available',
                    audio: ['sub'],
                },
                {
                    episodeId: 'episode-7',
                    number: 7,
                    airDate: '2026-08-10',
                    kind: 'audio_available',
                    audio: ['dub'],
                },
            ]
        );

        expect(inputs.map(({ kind, audio, dedupeKey }) => ({ kind, audio, dedupeKey }))).toEqual([
            {
                kind: 'episode_available',
                audio: ['sub'],
                dedupeKey: 'episode_available:10:episode-7',
            },
            {
                kind: 'audio_available',
                audio: ['dub'],
                dedupeKey: 'audio_available:10:episode-7:dub',
            },
        ]);
    });

    test('uses one current release notification on first inventory observation', () => {
        expect(
            notificationInputsForInitialAvailability(
                {
                    anilistId: 20,
                    title: 'Sequel',
                    status: 'RELEASING',
                    episodeId: 'episode-17',
                    episodeNumber: 17,
                    audio: ['dub', 'sub'],
                    airDate: null,
                },
                [recipient]
            ).map(({ kind, dedupeKey, episodeNumber, audio }) => ({
                kind,
                dedupeKey,
                episodeNumber,
                audio,
            }))
        ).toEqual([
            {
                kind: 'season_available',
                dedupeKey: 'season_available:20',
                episodeNumber: 17,
                audio: ['sub', 'dub'],
            },
        ]);
    });

    test('does not backfill completed seasons or notify a direct root as a new season', () => {
        const release = {
            anilistId: 20,
            title: 'Anime',
            episodeId: 'episode-12',
            episodeNumber: 12,
            audio: ['sub'] as const,
            airDate: null,
        };

        expect(
            notificationInputsForInitialAvailability({ ...release, status: 'FINISHED' }, [
                recipient,
            ])
        ).toEqual([]);
        expect(
            notificationInputsForInitialAvailability(
                { ...release, anilistId: 10, status: 'RELEASING' },
                [recipient]
            )
        ).toEqual([]);
    });
});
