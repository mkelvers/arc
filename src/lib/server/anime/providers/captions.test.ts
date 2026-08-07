import { describe, expect, test } from 'bun:test';

import { fullestCaption } from './captions';

describe('provider captions', () => {
  test('prefers cue coverage over provider naming and defaults', async () => {
    const values: Record<string, string> = {
      ai: 'WEBVTT\n\n00:01.000 --> 00:02.000\none\n',
      signs: 'WEBVTT\n\n00:01.000 --> 00:02.000\nsign\n',
      dialogue: 'WEBVTT\n\n00:01.000 --> 00:02.000\none\n\n00:03.000 --> 00:04.000\ntwo\n',
    };

    expect(
      await fullestCaption(
        [
          { url: 'ai', preferred: true },
          { url: 'signs', preferred: false },
          { url: 'dialogue', preferred: false },
        ],
        async (url) => values[url]
      )
    ).toBe('dialogue');
  });

  test('uses the provider default when every measurement fails', async () => {
    expect(
      await fullestCaption(
        [
          { url: 'first', preferred: false },
          { url: 'default', preferred: true },
        ],
        async () => {
          throw new Error('offline');
        }
      )
    ).toBe('default');
  });
});
