import { describe, expect, test } from 'bun:test';

import {
    proxiedStreamUrl,
    rewriteHlsPlaylist,
    streamTarget,
    StreamTargetError,
    streamTargetParameter,
    unwrapPngSegment,
} from './stream-proxy';

describe('stream proxy', () => {
    test('only accepts HTTPS provider media hosts', () => {
        expect(
            streamTarget(
                'https://megap.kotocdn.site/show/master.m3u8',
            ).hostname,
        ).toBe('megap.kotocdn.site');
        expect(() =>
            streamTarget('http://megap.kotocdn.site/show/master.m3u8'),
        ).toThrow(StreamTargetError);
        expect(() =>
            streamTarget('https://127.0.0.1/private'),
        ).toThrow(StreamTargetError);
    });

    test('rewrites relative variants, segments, and tag URIs', () => {
        const playlist = new URL(
            'https://megap.kotocdn.site/show/master.m3u8',
        );
        const result = rewriteHlsPlaylist(
            [
                '#EXTM3U',
                '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
                '720/index.m3u8',
            ].join('\n'),
            playlist,
        );

        expect(result).toContain(
            proxiedStreamUrl(
                new URL(
                    'https://megap.kotocdn.site/show/key.bin',
                ),
            ),
        );
        expect(result).toContain(
            proxiedStreamUrl(
                new URL(
                    'https://megap.kotocdn.site/show/720/index.m3u8',
                ),
            ),
        );

        const proxied = new URL(
            proxiedStreamUrl(
                new URL(
                    'https://megap.kotocdn.site/show/720/index.m3u8',
                ),
            ),
            'http://arc.local',
        );
        expect(streamTargetParameter(proxied)).toBe(
            'https://megap.kotocdn.site/show/720/index.m3u8',
        );
    });

    test('removes the PNG prefix used by wrapped HLS segments', () => {
        const prefix = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x49, 0x45, 0x4e, 0x44, 0xae,
            0x42, 0x60, 0x82,
        ]);
        const transportStream = new Uint8Array([0x47, 0x40, 0x11]);
        const wrapped = new Uint8Array(
            prefix.length + transportStream.length,
        );
        wrapped.set(prefix);
        wrapped.set(transportStream, prefix.length);

        expect([...unwrapPngSegment(wrapped)]).toEqual([
            ...transportStream,
        ]);
        expect(unwrapPngSegment(transportStream)).toBe(
            transportStream,
        );
    });
});
