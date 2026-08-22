import { describe, expect, test } from 'bun:test';

import type { FranchiseOrder } from '@arc/shared/types';
import { type FranchisePlaybackEpisode, withFranchisePlayback } from './playback';

function entry(anilistId: number, audioLabel: string): FranchiseOrder['entries'][number] {
    return {
        malId: anilistId,
        anilistId,
        id: anilistId,
        type: 'TV',
        title: `Anime ${anilistId}`,
        image: '',
        audioLabel,
        format: 'TV',
        status: 'FINISHED',
        episodes: 12,
        duration: 24,
        popularity: 10_000,
        relations: [],
        score: 0,
        genres: [],
        synopsis: '',
        secondary: false,
        primary: true,
        href: `/anime/${anilistId}`,
        link: `/anime/${anilistId}`,
    };
}

describe('withFranchisePlayback', () => {
    test('overlays current audio facts on every cached franchise entry', () => {
        const cached = [entry(1, 'Dub | Sub'), entry(2, '')];
        const episodes: FranchisePlaybackEpisode[] = [
            { anilistId: 1, episodeId: '2', number: 2, audio: ['dub'] },
            {
                anilistId: 1,
                episodeId: '1',
                number: 1,
                audio: ['sub'],
            },
            {
                anilistId: 2,
                episodeId: 'special',
                number: 1,
                audio: ['sub', 'dub'],
            },
        ];

        const current = withFranchisePlayback(cached, episodes);

        expect(
            current.map(({ audioLabel, link }) => ({
                audioLabel,
                link,
            }))
        ).toEqual([
            {
                audioLabel: 'Dub | Sub',
                link: '/anime/1/watch/1',
            },
            {
                audioLabel: 'Dub | Sub',
                link: '/anime/2/watch/special',
            },
        ]);
    });

    test('does not retain playback values without current episode facts', () => {
        const [current] = withFranchisePlayback(
            [
                {
                    ...entry(1, 'Dub | Sub'),
                    link: '/anime/1/watch/stale',
                },
            ],
            []
        );

        expect(current?.audioLabel).toBe('');
        expect(current?.link).toBe('/anime/1');
    });
});
