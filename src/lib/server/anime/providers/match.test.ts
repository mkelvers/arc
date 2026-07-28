import { describe, expect, test } from 'bun:test';

import { episodeTitleScore, matchProviderEpisode } from './match';

describe('playback episode identity matching', () => {
    test('matches provider numbering by title before ordinal position', () => {
        const episodes = [
            {
                id: 'provider-1',
                number: 1,
                title: 'Hey! Butts!',
                audio: ['sub' as const],
            },
            {
                id: 'provider-2',
                number: 2,
                title: 'The Tragedy of M?',
                audio: ['sub' as const],
            },
        ];

        expect(
            matchProviderEpisode(episodes, {
                id: '1',
                number: 1,
                title: 'Extra: The Tragedy of M?',
            }),
        ).toBe(episodes[1]);
    });

    test('falls back to the provider number for generic titles', () => {
        const episodes = [
            { number: 1, title: 'First' },
            { number: 2, title: 'Second' },
        ];

        expect(
            matchProviderEpisode(episodes, {
                id: '2',
                number: 2,
                title: 'Episode 2',
            }),
        ).toBe(episodes[1]);
    });

    test('recognizes provider titles with episode and extra prefixes', () => {
        expect(
            episodeTitleScore(
                'Episode 1 Hey! Butts!',
                'Extra: Hey! Butts!',
            ),
        ).toBe(100);
    });

    test('recognizes a translated title joined to its romanization', () => {
        expect(episodeTitleScore('SinTsumi', 'Sin')).toBe(75);
        expect(episodeTitleScore('HeroYuusha', 'Hero')).toBe(75);
        expect(
            episodeTitleScore(
                'Attack TitanShingeki no Kyojin',
                'The Attack Titan',
            ),
        ).toBe(75);
    });

    test('rejects a conflicting substantive title at the same number', () => {
        expect(
            matchProviderEpisode(
                [
                    {
                        number: 1,
                        title: "Ilse's Notebook",
                    },
                ],
                {
                    id: '1',
                    number: 1,
                    title: 'To You, in 2000 Years',
                },
            ),
        ).toBeUndefined();
    });

    test('does not collapse a fractional recap into a related regular title', () => {
        expect(
            matchProviderEpisode(
                [
                    {
                        number: 2,
                        title: 'That Day',
                    },
                ],
                {
                    id: '13.5',
                    number: 13.5,
                    title: 'Since That Day',
                },
            ),
        ).toBeUndefined();
    });
});
