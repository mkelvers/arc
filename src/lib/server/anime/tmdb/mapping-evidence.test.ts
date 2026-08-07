import { describe, expect, test } from 'bun:test';

import {
  relatedSpecialMappingIsBetter,
  specialEpisodeEvidenceScore,
  type SpecialEpisodeEvidence,
} from './mapping-evidence';
import type { AniListAnime } from './types';

const anime = {
  duration: 24,
  endDate: { year: 2023, month: 11, day: 1 },
  episodes: 3,
  format: 'OVA',
  relations: {
    edges: [
      {
        node: {
          type: 'ANIME',
          title: {
            english: 'That Time I Got Reincarnated as a Slime',
            romaji: 'Tensei Shitara Slime Datta Ken',
          },
        },
      },
    ],
  },
  startDate: { year: 2023, month: 11, day: 1 },
  title: {
    english: 'That Time I Got Reincarnated as a Slime: Visions of Coleus',
    romaji: 'Tensei Shitara Slime Datta Ken: Coleus no Yume',
  },
} as AniListAnime;

function episode(
  seasonNumber: number,
  name: string,
  airDate: string,
  complete: boolean
): SpecialEpisodeEvidence {
  return {
    airDate,
    name,
    overview: complete ? `${name} synopsis` : '',
    runtime: 24,
    seasonNumber,
    stillPath: complete ? '/still.jpg' : null,
  };
}

describe('TMDB special-release mapping evidence', () => {
  test('prefers canonical parent specials over a stale duplicate series', () => {
    const duplicate = specialEpisodeEvidenceScore(
      anime,
      ['Episode 1', 'Episode 2', 'Episode 3'].map((name) => episode(1, name, '2022-11-02', false))
    );
    const incompleteDuplicate = specialEpisodeEvidenceScore(
      anime,
      ['Episode 1', 'Episode 2', 'Episode 3'].map((name) => episode(1, name, '2023-11-01', false))
    );
    const parent = specialEpisodeEvidenceScore(
      anime,
      [
        'Visions of Coleus: To Coleus',
        'Visions of Coleus: Great Phantom Thief Satoru',
        'Visions of Coleus: Purple and Roses',
      ].map((name) => episode(0, name, '2023-11-01', true))
    );

    expect(duplicate).toBe(0);
    expect(parent).toBeGreaterThanOrEqual(280);
    expect(relatedSpecialMappingIsBetter(duplicate, parent)).toBeTrue();
    expect(relatedSpecialMappingIsBetter(incompleteDuplicate, parent)).toBeTrue();
  });

  test('keeps an equally well-supported standalone series', () => {
    const direct = specialEpisodeEvidenceScore(
      anime,
      [
        'Visions of Coleus: To Coleus',
        'Visions of Coleus: Great Phantom Thief Satoru',
        'Visions of Coleus: Purple and Roses',
      ].map((name) => episode(1, name, '2023-11-01', true))
    );
    const related = specialEpisodeEvidenceScore(
      anime,
      [
        'Visions of Coleus: To Coleus',
        'Visions of Coleus: Great Phantom Thief Satoru',
        'Visions of Coleus: Purple and Roses',
      ].map((name) => episode(0, name, '2023-11-01', true))
    );

    expect(relatedSpecialMappingIsBetter(direct, related)).toBeFalse();
  });
});
