import { describe, expect, test } from 'bun:test';

import {
    episodeTitleScore,
    matchProviderEpisode,
    matchProviderStreamEpisode,
    specialCollectionMatches,
    standaloneSpecialMatches,
} from './match';
import type { ProviderAnime } from './types';

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

    test('maps the sole episode of an exact one-episode release despite a generic provider title', () => {
        const episodes = [{ number: 1, title: 'full' }];

        expect(
            matchProviderStreamEpisode(
                episodes,
                {
                    id: '1',
                    number: 1,
                    title: 'Solo Leveling -ReAwakening-',
                },
                1,
            ),
        ).toBe(episodes[0]);
        expect(
            matchProviderStreamEpisode(
                episodes,
                {
                    id: '1',
                    number: 1,
                    title: 'A Different Series',
                },
                12,
            ),
        ).toBeUndefined();
    });

    test('uses provider numbering for regular stream lookup despite a conflicting display title', () => {
        const episodes = [
            { number: 1, title: 'Provider title one' },
            { number: 2, title: 'Provider title two' },
        ];

        expect(
            matchProviderStreamEpisode(
                episodes,
                {
                    id: '2',
                    number: 2,
                    title: 'Unrelated metadata title',
                },
                2,
            ),
        ).toBe(episodes[1]);
    });

    test('requires both the parent franchise and special title for a standalone match', () => {
        const anime = {
            id: 108511,
            title: {
                english:
                    'That Time I Got Reincarnated as a Slime Season 2',
                romaji:
                    'Tensei Shitara Slime Datta Ken 2nd Season',
            },
            synonyms: [],
        } as unknown as ProviderAnime;
        const episode = {
            id: '0.9',
            number: 0.9,
            title: 'Digression: Hinata Sakaguchi',
        };

        expect(
            standaloneSpecialMatches(anime, episode, [
                'That Time I Got Reincarnated as a Slime Season 2: Digression - Hinata Sakaguchi',
            ]),
        ).toBe(true);
        expect(
            standaloneSpecialMatches(anime, episode, [
                'Another Anime: Digression - Hinata Sakaguchi',
            ]),
        ).toBe(false);
        expect(
            standaloneSpecialMatches(anime, episode, [
                'That Time I Got Reincarnated as a Slime Season 2: Special',
            ]),
        ).toBe(false);
    });

    test('maps an ordered specials collection only when its size and parent match', () => {
        const anime = {
            id: 156822,
            title: {
                english:
                    'That Time I Got Reincarnated as a Slime Season 3',
                romaji:
                    'Tensei Shitara Slime Datta Ken 3rd Season',
            },
            synonyms: [],
        } as unknown as ProviderAnime;
        const episode = {
            id: '17.5',
            number: 17.5,
            title: 'Digression: Luminus Memories',
            specialIndex: 2,
            specialCount: 2,
        };

        expect(
            specialCollectionMatches(
                anime,
                episode,
                [
                    'That Time I Got Reincarnated as a Slime Season 03: Specials',
                ],
                2,
            ),
        ).toBe(true);
        expect(
            specialCollectionMatches(
                anime,
                episode,
                [
                    'That Time I Got Reincarnated as a Slime Season 03: Specials',
                ],
                1,
            ),
        ).toBe(false);
        expect(
            specialCollectionMatches(
                anime,
                episode,
                ['Another Anime Season 3: Specials'],
                2,
            ),
        ).toBe(false);
        expect(
            specialCollectionMatches(
                anime,
                episode,
                [
                    'That Time I Got Reincarnated as a Slime Season 02: Specials',
                ],
                2,
            ),
        ).toBe(false);
    });
});
