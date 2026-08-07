import { describe, expect, test } from 'bun:test';

import {
  coversExpectedEpisodes,
  episodeTitleScore,
  matchProviderEpisode,
  matchProviderStreamEpisode,
  releaseInventoryEvidence,
  specialCollectionMatches,
  standaloneSpecialMatches,
} from './match';
import type { ProviderAnime } from './types';

describe('playback episode identity matching', () => {
  test('requires every expected numbered episode', () => {
    expect(coversExpectedEpisodes([{ number: 1 }, { number: 2 }], 3)).toBe(false);
    expect(
      coversExpectedEpisodes([{ number: 0.5 }, { number: 1 }, { number: 2 }, { number: 3 }], 3)
    ).toBe(true);
  });

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
      })
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
      })
    ).toBe(episodes[1]);
  });

  test('recognizes provider titles with episode and extra prefixes', () => {
    expect(episodeTitleScore('Episode 1 Hey! Butts!', 'Extra: Hey! Butts!')).toBe(100);
  });

  test('recognizes a translated title joined to its romanization', () => {
    expect(episodeTitleScore('SinTsumi', 'Sin')).toBe(75);
    expect(episodeTitleScore('HeroYuusha', 'Hero')).toBe(75);
    expect(episodeTitleScore('Attack TitanShingeki no Kyojin', 'The Attack Titan')).toBe(75);
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
        }
      )
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
        }
      )
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
        1
      )
    ).toBe(episodes[0]);
    expect(
      matchProviderStreamEpisode(
        episodes,
        {
          id: '1',
          number: 1,
          title: 'A Different Series',
        },
        12
      )
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
        2
      )
    ).toBe(episodes[1]);
  });

  test('identifies an inventory from a related cour', () => {
    const release = [
      { number: 1, title: 'Rhythm' },
      { number: 2, title: 'Found' },
      { number: 3, title: 'The Ultimate Challengers' },
    ];
    const firstCour = [
      { number: 1, title: 'Introductions' },
      { number: 2, title: 'Lost' },
      { number: 3, title: 'Challenger' },
    ];

    expect(releaseInventoryEvidence(firstCour, release, [firstCour])).toBe('conflicting');
    expect(
      matchProviderStreamEpisode(
        firstCour,
        {
          id: 'one',
          number: 1,
          title: 'Rhythm',
          release,
          relatedReleases: [firstCour],
        },
        3
      )
    ).toBeUndefined();
  });

  test('does not infer a conflict from unknown or localized titles alone', () => {
    const release = [
      { number: 1, title: 'Rhythm' },
      { number: 2, title: 'Found' },
    ];

    expect(
      releaseInventoryEvidence(
        [
          { number: 1, title: 'Rizumu' },
          { number: 2, title: 'Mitsuketa' },
        ],
        release
      )
    ).toBe('unknown');
    expect(
      releaseInventoryEvidence(
        [
          { number: 1, title: 'Episode 1' },
          { number: 2, title: 'Episode 2' },
        ],
        release
      )
    ).toBe('unknown');
  });

  test('uses corroborated release titles when provider numbering is reordered', () => {
    const episodes = [
      { number: 1, title: 'Found' },
      { number: 2, title: 'Rhythm' },
    ];
    const release = [
      { number: 1, title: 'Rhythm' },
      { number: 2, title: 'Found' },
    ];

    expect(releaseInventoryEvidence(episodes, release)).toBe('aligned');
    expect(
      matchProviderStreamEpisode(
        episodes,
        {
          id: 'one',
          number: 1,
          title: 'Rhythm',
          release,
        },
        2
      )
    ).toBe(episodes[1]);
  });

  test('requires both the parent franchise and special title for a standalone match', () => {
    const anime = {
      id: 108511,
      title: {
        english: 'That Time I Got Reincarnated as a Slime Season 2',
        romaji: 'Tensei Shitara Slime Datta Ken 2nd Season',
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
      ])
    ).toBe(true);
    expect(
      standaloneSpecialMatches(anime, episode, ['Another Anime: Digression - Hinata Sakaguchi'])
    ).toBe(false);
    expect(
      standaloneSpecialMatches(anime, episode, [
        'That Time I Got Reincarnated as a Slime Season 2: Special',
      ])
    ).toBe(false);
  });

  test('maps an ordered specials collection only when its size and parent match', () => {
    const anime = {
      id: 156822,
      title: {
        english: 'That Time I Got Reincarnated as a Slime Season 3',
        romaji: 'Tensei Shitara Slime Datta Ken 3rd Season',
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
        ['That Time I Got Reincarnated as a Slime Season 03: Specials'],
        2
      )
    ).toBe(true);
    expect(
      specialCollectionMatches(
        anime,
        episode,
        ['That Time I Got Reincarnated as a Slime Season 03: Specials'],
        1
      )
    ).toBe(false);
    expect(specialCollectionMatches(anime, episode, ['Another Anime Season 3: Specials'], 2)).toBe(
      false
    );
    expect(
      specialCollectionMatches(
        anime,
        episode,
        ['That Time I Got Reincarnated as a Slime Season 02: Specials'],
        2
      )
    ).toBe(false);
  });
});
