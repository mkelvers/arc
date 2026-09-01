import { Buffer } from 'node:buffer';

import { expect, test } from 'bun:test';

import { playbackResponse } from './playback-response';

const source = {
    provider: 'anikoto',
    server: 'VidPlay-1',
    url: 'https://cdn.kryntal.top/master.m3u8',
    quality: null,
    subtitles: [
        {
            kind: 'full' as const,
            url: 'https://cdn.kryntal.top/english.vtt',
        },
    ],
};

test('proxies every media and caption URL at the playback response boundary', () => {
    const response = playbackResponse({
        error: false,
        streams: {
            sub: [source],
        },
    });
    const mapped = response.streams.sub[0];
    const encodedMedia = Buffer.from(source.url).toString('base64url');
    const encodedCaptions = Buffer.from(source.subtitles[0].url).toString('base64url');

    expect(mapped.url).toBe(`/v1/stream?src=${encodedMedia}`);
    expect(mapped.subtitles[0]?.url).toBe(`/v1/stream?src=${encodedCaptions}`);
    expect(mapped.url).not.toContain('kryntal.top');
    expect(mapped.subtitles[0]?.url).not.toContain('kryntal.top');
});

test('rejects iframe-shaped streams and unknown audio modes', () => {
    expect(() =>
        playbackResponse({
            error: false,
            streams: {
                sub: [
                    {
                        ...source,
                        kind: 'iframe',
                    },
                ],
            },
        })
    ).toThrow();
    expect(() =>
        playbackResponse({
            error: false,
            streams: {
                commentary: [source],
            },
        })
    ).toThrow();
});
