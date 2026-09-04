import { describe, expect, test } from 'bun:test';

import type { AnimeEpisode } from '@arc/core';
import { continuationEpisode, resumePosition, selectPlaybackProgress } from './continue';

const episodes: AnimeEpisode[] = [
    {
        id: 'one',
        number: 1,
        label: 'E1',
        title: 'One',
        href: '/one',
        audio: ['sub'],
        image: null,
        duration: '24m',
        releaseDate: '',
        overview: '',
    },
    {
        id: 'two',
        number: 2,
        label: 'E2',
        title: 'Two',
        href: '/two',
        audio: ['sub'],
        image: null,
        duration: '24m',
        releaseDate: '',
        overview: '',
    },
];

describe('continue watching target', () => {
    test('keeps an unfinished episode and its position', () => {
        const progress = {
            episodeId: 'one',
            positionSeconds: 321,
            completed: false,
        };

        expect(continuationEpisode(progress, episodes, false)?.id).toBe('one');
        expect(resumePosition(progress, 'one')).toBe(321);
    });

    test('advances after a completed episode', () => {
        const progress = {
            episodeId: 'one',
            positionSeconds: 1_440,
            completed: true,
        };

        expect(continuationEpisode(progress, episodes, false)?.id).toBe('two');
        expect(resumePosition(progress, 'one')).toBe(0);
    });

    test('has no continuation after the latest episode', () => {
        expect(
            continuationEpisode(
                {
                    episodeId: 'two',
                    positionSeconds: 1_440,
                    completed: true,
                },
                episodes,
                true
            )
        ).toBeNull();
    });

    test('keeps the newest completed episode available while the release is airing', () => {
        expect(
            continuationEpisode(
                {
                    episodeId: 'two',
                    positionSeconds: 1_440,
                    completed: true,
                },
                episodes,
                false
            )?.id
        ).toBe('two');
    });
});

describe('playback progress selection', () => {
    test('prefers meaningful unfinished progress over a newer shallow row', () => {
        const candidate = (episodeId: string, positionSeconds: number, watchedAt: string) => ({
            id: episodeId,
            episodeId,
            positionSeconds,
            durationSeconds: 1_000,
            completed: false,
            lastWatchedAt: new Date(watchedAt),
            eventAt: new Date(watchedAt),
            updatedAt: new Date(watchedAt),
        });

        expect(
            selectPlaybackProgress([
                candidate('episode-2', 2, '2026-09-03T08:15:33.499Z'),
                candidate('episode-19', 472, '2026-09-03T08:05:48.019Z'),
            ])?.episodeId
        ).toBe('episode-19');
    });
});
