import { describe, expect, test } from 'bun:test';

import {
    completeEpisodeDetails,
    episodeDetailsNeeded,
    translatableMetadata,
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
        expect(episodeDetailsNeeded(candidate, 'ja')).toEqual({
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

    test('uses only explicitly English text for a Japanese episode', () => {
        expect(
            completeEpisodeDetails(candidate, {
                details: {
                    name: 'Episode 4',
                    overview: '',
                },
                translations: [
                    {
                        country: 'US',
                        language: 'en',
                        name: 'Accomplices',
                        overview: '',
                    },
                    {
                        country: 'JP',
                        language: 'ja',
                        name: '共犯者たち',
                        overview: '日本語で利用可能なあらすじ。',
                    },
                    {
                        country: 'ES',
                        language: 'es',
                        name: 'Cómplices',
                        overview: 'Resumen disponible en español.',
                    },
                ],
                originalLanguage: 'ja',
                image: (path) => path,
            }),
        ).toMatchObject({
            title: 'Accomplices',
            titleSource: 'tmdb',
            overview: '',
            overviewSource: null,
        });

        expect(
            translatableMetadata(
                [
                    {
                        country: 'JP',
                        language: 'ja',
                        name: '共犯者たち',
                        overview: '日本語で利用可能なあらすじ。',
                    },
                    {
                        country: 'ES',
                        language: 'es',
                        name: 'Cómplices',
                        overview: 'Resumen disponible en español.',
                    },
                ],
                'ja',
            ),
        ).toEqual({
            name: '共犯者たち',
            overview: '日本語で利用可能なあらすじ。',
        });
    });

    test('keeps Japanese episodes eligible for English translation refresh', () => {
        const completeCandidate = {
            ...candidate,
            title: 'Crybaby and Naughty Child',
            overview: 'Japanese text returned by a localized endpoint',
            imageUrl: 'https://images.example/still.jpg',
            runtime: 24,
        };

        expect(episodeDetailsNeeded(completeCandidate, 'ja')).toEqual({
            details: false,
            translations: true,
            images: false,
        });
    });

    test('trusts text from an English-original episode', () => {
        expect(
            completeEpisodeDetails(
                {
                    ...candidate,
                    title: 'A New Beginning',
                    overview: 'The journey begins.',
                },
                {
                    originalLanguage: 'en',
                    image: (path) => path,
                },
            ),
        ).toMatchObject({
            title: 'A New Beginning',
            overview: 'The journey begins.',
        });
    });
});
