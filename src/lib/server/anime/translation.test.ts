import { describe, expect, test } from 'bun:test';

import { translationChunks } from './translation';

describe('local episode translation', () => {
  test('keeps every sentence while bounding model inputs', () => {
    const text = `${'あ'.repeat(100)}。${'い'.repeat(100)}。短い文。`;
    const chunks = translationChunks(text);

    expect(chunks.every((chunk) => chunk.length <= 180)).toBeTrue();
    expect(chunks.join('')).toBe(text);
  });
});
