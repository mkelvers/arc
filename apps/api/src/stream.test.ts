import { expect, test } from 'bun:test';

import { proxyStreamRequest } from './stream';

test('proxies KickAssAnime HLS playlists', async () => {
    let referer = '';
    const response = await proxyStreamRequest(
        new Request(
            'http://localhost/v1/stream?url=https://hls.krussdomi.com/manifest/example/master.m3u8'
        ),
        async (_target, init) => {
            referer = new Headers(init.headers).get('Referer') ?? '';
            return new Response('#EXTM3U\n#EXT-X-ENDLIST', {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });
        }
    );

    expect(response.status).toBe(200);
    expect(referer).toBe('https://krussdomi.com/');
    expect(await response.text()).toContain('#EXTM3U');
});
