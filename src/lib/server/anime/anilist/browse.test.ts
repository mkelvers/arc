import { describe, expect, test } from 'bun:test';

import { browseMediaSort } from './browse';

describe('AniList browse ordering', () => {
  test.each([
    ['popularity', 'asc', 'POPULARITY'],
    ['popularity', 'desc', 'POPULARITY_DESC'],
    ['score', 'asc', 'SCORE'],
    ['score', 'desc', 'SCORE_DESC'],
  ] as const)('maps %s %s to %s', (sort, order, expected) => {
    expect(
      browseMediaSort({
        sort,
        order,
      })
    ).toBe(expected);
  });
});
