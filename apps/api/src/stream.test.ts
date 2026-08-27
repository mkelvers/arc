import { expect, test } from 'bun:test';

import { proxyStreamRequest } from './stream';

test('proxies KickAssAnime CDN HLS playlists', async () => {
    let referer = '';
    const response = await proxyStreamRequest(
        new Request(
            'http://localhost/v1/stream?url=https://bl.krussdomi.com/playlist/example/master.m3u8'
        ),
        async (_target, init) => {
            referer = new Headers(init.headers).get('Referer') ?? '';
            return new Response(
                '#EXTM3U\nhttp://bl1.advancedairesearchlab.xyz/segment.ts\n#EXT-X-ENDLIST',
                {
                    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                }
            );
        }
    );

    expect(response.status).toBe(200);
    expect(referer).toBe('https://krussdomi.com/');
    const body = await response.text();
    expect(body).toContain('#EXTM3U');
    expect(body).toContain('/v1/stream?src=');
});

test('proxies MegaPlay rotated Kryntal CDN HLS playlists', async () => {
    let referer = '';
    const response = await proxyStreamRequest(
        new Request(
            'http://localhost/v1/stream?url=https://cdn.kryntal.top/anime/example/master.m3u8'
        ),
        async (_target, init) => {
            referer = new Headers(init.headers).get('Referer') ?? '';
            return new Response('#EXTM3U\n#EXT-X-ENDLIST', {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });
        }
    );

    expect(response.status).toBe(200);
    expect(referer).toBe('https://megaplay.buzz/');
});
