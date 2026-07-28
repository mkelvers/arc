import { describe, expect, test } from 'bun:test';

import {
    completeEpisodeDetails,
    episodeDetailsNeeded,
} from './episode-details';
import type { EpisodeCandidate } from './types';

const candidate: EpisodeCandidate = {
    episodeNumber: 4,
    seasonNumber: 1,
    title: 'Episode 4',
    overview: '',
    imageUrl: null,
    runtime: null,
    rawAirDate: '2026-07-28',
    airDate: '07/28/2026',
};

describe('TMDB episode detail completion', () => {
    test('fills a stale season row from translations, featured data, and stills', () => {
        expect(episodeDetailsNeeded(candidate)).toEqual({
            details: true,
            translations: true,
            images: true,
        });
        expect(
            completeEpisodeDetails(candidate, {
                details: {
                    name: 'Episode 4',
                    overview: '',
                    runtime: null,
                    stillPath: null,
                },
                translations: [
                    {
                        country: 'US',
                        language: 'en',
                        name: 'Accomplices',
                        overview: 'Sheena is sworn to secrecy.',
                    },
                ],
                featured: {
                    name: 'Accomplices',
                    overview: 'Featured overview',
                    runtime: 24,
                    stillPath: null,
                },
                stills: [
                    {
                        filePath: '/small.jpg',
                        voteAverage: 1,
                        voteCount: 1,
                        width: 1920,
                    },
                    {
                        filePath: '/best.jpg',
                        voteAverage: 3,
                        voteCount: 1,
                        width: 3840,
                    },
                ],
                image: (path) => `https://images.example${path}`,
            }),
        ).toMatchObject({
            title: 'Accomplices',
            overview: 'Sheena is sworn to secrecy.',
            runtime: 24,
            imageUrl: 'https://images.example/best.jpg',
        });
    });
});
