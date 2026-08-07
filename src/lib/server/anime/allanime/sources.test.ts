import { describe, expect, test } from 'bun:test';

import { decodeSourceUrl } from './sources';

function encode(value: string) {
  return [...value]
    .map((character) => (character.charCodeAt(0) ^ 0x38).toString(16).padStart(2, '0'))
    .join('');
}

describe('AllAnime source URLs', () => {
  test('decodes the provider substitution and clock endpoint', () => {
    expect(decodeSourceUrl(`--${encode('/clock')}`)).toBe('/clock.json');
  });

  test('keeps ordinary URLs unchanged', () => {
    expect(decodeSourceUrl('https://media.example/video.mp4')).toBe(
      'https://media.example/video.mp4'
    );
  });
});
