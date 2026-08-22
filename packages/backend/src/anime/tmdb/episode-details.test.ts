import { describe, expect, test } from 'bun:test';

import {
    completeEpisodeDetails,
    episodeDetailsNeeded,
    hasRequestedEpisodeLocalization,
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
    test('does not label non-English episode text as English TMDB metadata', () => {
        expect(
            completeEpisodeDetails(
                {
                    ...candidate,
                    episodeNumber: 6,
                    title: 'Lingering Scent Behind the Supermarket with You',
                },
                {
                    translations: [
                        {
                            country: 'US',
                            language: 'en',
                            name: 'Lingering Scent Behind the Supermarket with You',
                            overview: '',
                        },
                        {
                            country: 'JP',
                            language: 'ja',
                            name: 'スーパーの裏に残る匂い',
                            overview:
                                'Sasaki has a cigarette and nowhere to smoke it—until a pierced stranger calls out to him in the night.',
                        },
                    ],
                    image: (path) => `https://images.example${path}`,
                }
            )
        ).toMatchObject({
            episodeNumber: 6,
            overview: '',
            overviewSource: null,
            imageUrl: null,
        });
    });

    test('fills a stale season row from translations, featured data, and stills', () => {
        expect(episodeDetailsNeeded(candidate, false)).toEqual({
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
            })
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
                localizedText: false,
                image: (path) => path,
            })
        ).toMatchObject({
            title: 'Accomplices',
            titleSource: 'tmdb',
            overview: '',
            overviewSource: null,
        });
    });

    test('fills fields from recent changes while the normal episode endpoints are stale', () => {
        expect(
            completeEpisodeDetails(candidate, {
                details: {
                    name: 'Death and Loss',
                    overview: '',
                    runtime: null,
                    stillPath: null,
                },
                translations: [
                    {
                        country: 'US',
                        language: 'en',
                        name: 'Death and Loss',
                        overview: '',
                    },
                ],
                changes: {
                    overview:
                        "Granville's true plan is revealed, but it may already be too late to stop it.",
                    runtime: 24,
                    stillPath: '/episode-19.jpg',
                },
                image: (path) => `https://images.example${path}`,
            })
        ).toMatchObject({
            title: 'Death and Loss',
            overview:
                "Granville's true plan is revealed, but it may already be too late to stop it.",
            runtime: 24,
            imageUrl: 'https://images.example/episode-19.jpg',
        });
    });

    test('keeps English group metadata when the translation endpoint has no text', () => {
        const episode = {
            ...candidate,
            seasonNumber: 1,
            episodeNumber: 78,
            releaseEpisodeNumber: 12,
            title: 'From Now On',
            overview:
                'After waking up without his memories yet again, Subaru makes up his mind to save Meili this time.',
            imageUrl: 'https://image.tmdb.org/t/p/w500/wCls3YU2fX7Lfy0Cjf3s1H3PnM2.jpg',
            runtime: 24,
            rawAirDate: '2026-08-12',
            airDate: '08/12/2026',
        };

        expect(
            completeEpisodeDetails(episode, {
                localizedText: false,
                image: (path) => path,
            })
        ).toMatchObject({
            title: 'From Now On',
            titleSource: 'tmdb',
            overview:
                'After waking up without his memories yet again, Subaru makes up his mind to save Meili this time.',
            overviewSource: 'tmdb',
            imageUrl: 'https://image.tmdb.org/t/p/w500/wCls3YU2fX7Lfy0Cjf3s1H3PnM2.jpg',
            runtime: 24,
            rawAirDate: '2026-08-12',
            airDate: '08/12/2026',
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

        expect(episodeDetailsNeeded(completeCandidate, false)).toEqual({
            details: false,
            translations: true,
            images: false,
        });
    });

    test('trusts text verified as the requested English localization', () => {
        const localized = {
            ...candidate,
            title: 'A New Beginning',
            overview: 'The journey begins.',
            imageUrl: 'https://images.example/still.jpg',
            runtime: 24,
        };

        expect(episodeDetailsNeeded(localized, true)).toEqual({
            details: false,
            translations: false,
            images: false,
        });
        expect(
            completeEpisodeDetails(localized, {
                localizedText: true,
                image: (path) => path,
            })
        ).toMatchObject({
            title: 'A New Beginning',
            overview: 'The journey begins.',
        });
    });

    test('recognizes localized bulk text from provider title evidence', () => {
        expect(
            hasRequestedEpisodeLocalization(
                'I’m Luffy! The Man Who’s Gonna Be King of the Pirates!',
                "I'm Luffy! The Man Who Will Become the Pirate King!",
                'ja'
            )
        ).toBeTrue();
        expect(
            hasRequestedEpisodeLocalization('A New Beginning', '新たな始まり', 'ja')
        ).toBeFalse();
    });
});
