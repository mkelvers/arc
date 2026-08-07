import { describe, expect, test } from 'bun:test';

import { selectHomeHero, utcWeekStart } from './selection';

describe('homepage hero selection', () => {
  test('uses Monday as the stable UTC week boundary', () => {
    expect(utcWeekStart(new Date('2026-08-02T23:59:59Z'))).toBe('2026-07-27');
    expect(utcWeekStart(new Date('2026-08-03T00:00:00Z'))).toBe('2026-08-03');
  });

  test('continues down the ranking until six candidates qualify', async () => {
    const selected = await selectHomeHero([1, 2, 3, 4, 5, 6, 7, 8], async (id) =>
      id === 2 || id === 6 ? null : id
    );

    expect(selected).toEqual([1, 3, 4, 5, 7, 8]);
  });
});
