import { describe, expect, test } from 'bun:test';

import type { AnimeEpisode } from '$lib/anime/types';
import {
    continuationEpisode,
    resumePosition,
} from './continue';

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

        expect(continuationEpisode(progress, episodes)?.id).toBe('one');
        expect(resumePosition(progress, 'one')).toBe(321);
    });

    test('advances after a completed episode', () => {
        const progress = {
            episodeId: 'one',
            positionSeconds: 1_440,
            completed: true,
        };

        expect(continuationEpisode(progress, episodes)?.id).toBe('two');
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
            ),
        ).toBeNull();
    });
});
