import { describe, expect, test } from 'bun:test';

import { episodeHeading } from './episode';

describe('episode heading', () => {
  test('omits the separator when no English title is available', () => {
    expect(episodeHeading({ label: 'E17', title: '' })).toBe('E17');
    expect(
      episodeHeading({
        label: 'E17',
        title: 'Crybaby and Naughty Child',
      })
    ).toBe('E17 – Crybaby and Naughty Child');
  });
});
