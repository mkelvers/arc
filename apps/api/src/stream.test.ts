import { Buffer } from 'node:buffer';

import { expect, test } from 'bun:test';

import { proxyStreamRequest } from './stream';

function streamRequest(source: string, headers?: HeadersInit) {
    const encoded = Buffer.from(source).toString('base64url');
    return new Request(`http://localhost/v1/stream?src=${encoded}`, { headers });
}

test('relays VidPlay captions from Anizara without changing their timing', async () => {
    const vtt = 'WEBVTT\n\n00:06.750 --> 00:07.740\nWhat is this?\n';
    const response = await proxyStreamRequest(
        streamRequest('https://cdn.anizara.store/subtitles/episode_eng.vtt'),
        async () => new Response(vtt)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    expect(await response.text()).toBe(vtt);
});

test.each([
    'https://cdn.anizara.store.evil.example/track.vtt',
    'https://anizara.store.evil.example/track.vtt',
    'https://localhost/track.vtt',
    'https://127.0.0.1/track.vtt',
    'https://user:password@cdn.anizara.store/track.vtt',
    'http://cdn.anizara.store/track.vtt',
])('rejects an unsafe subtitle URL: %s', async (url) => {
    await expect(
        proxyStreamRequest(streamRequest(url), async () => {
            throw new Error('unsafe URL must not be fetched');
        })
    ).rejects.toMatchObject({ reason: { kind: 'unsupported-host' } });
});

test('proxies AniKoto HLS with the MegaPlay referer and rewrites playlist references', async () => {
    let requestedUrl = '';
    let referer = '';
    const response = await proxyStreamRequest(
        streamRequest('https://s1.akirax.buzz/path/master.m3u8'),
        async (target, init) => {
            requestedUrl = target.toString();
            referer = new Headers(init.headers).get('Referer') ?? '';
            return new Response(
                '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://s3.shiora.top/path/key.bin"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://s3.shiora.top/path/child/index.m3u8\n#EXTINF:4,\nhttps://s3.shiora.top/path/segment.jpg',
                {
                    headers: {
                        'content-type': 'application/vnd.apple.mpegurl',
                    },
                }
            );
        }
    );

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe('https://s1.akirax.buzz/path/master.m3u8');
    expect(referer).toBe('https://megaplay.buzz/');
    const body = await response.text();
    expect(body).toContain('#EXTM3U');
    expect(body).toContain('/v1/stream?src=');
    expect(body).not.toContain('child/index.m3u8');
    expect(body).not.toContain('segment-1.ts');
    expect(body).toContain(
        Buffer.from('https://s3.akirax.buzz/path/child/index.m3u8').toString('base64url')
    );
    expect(body).not.toContain(
        Buffer.from('https://s3.shiora.top/path/child/index.m3u8').toString('base64url')
    );
});

test('keeps the upstream referer and range on child media requests', async () => {
    let range = '';
    let referer = '';
    const response = await proxyStreamRequest(
        streamRequest('https://cdn.kryntal.top/path/segment.ts', { Range: 'bytes=0-10' }),
        async (_target, init) => {
            const headers = new Headers(init.headers);
            range = headers.get('Range') ?? '';
            referer = headers.get('Referer') ?? '';
            return new Response(new Uint8Array([1, 2, 3]), {
                status: 206,
                headers: {
                    'content-type': 'video/mp2t',
                    'content-length': '3',
                },
            });
        }
    );

    expect(response.status).toBe(206);
    expect(range).toBe('bytes=0-10');
    expect(referer).toBe('https://megaplay.buzz/');
    expect(await response.arrayBuffer()).toHaveLength(3);
});

test('rejects sources outside the AniKoto media hosts', async () => {
    await expect(
        proxyStreamRequest(
            streamRequest('https://evil.example/master.m3u8'),
            async () => new Response()
        )
    ).rejects.toMatchObject({
        reason: {
            kind: 'unsupported-host',
        },
    });
});

test('rejects an upstream HTML response where an HLS playlist is expected', async () => {
    await expect(
        proxyStreamRequest(
            streamRequest('https://s1.akirax.buzz/path/master.m3u8'),
            async () => new Response('<html>blocked</html>')
        )
    ).rejects.toMatchObject({
        reason: {
            kind: 'invalid-playlist',
        },
    });
});

test('falls back from a reset Kryntal resource to its Watching alternate', async () => {
    const requested: string[] = [];
    const response = await proxyStreamRequest(
        streamRequest('https://cdn.kryntal.top/anime/episode/subtitles/english.vtt'),
        async (target) => {
            requested.push(target.hostname);
            return target.hostname === 'cdn.kryntal.top'
                ? new Response(null, { status: 502 })
                : new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello');
        }
    );

    expect(response.status).toBe(200);
    expect(requested).toEqual(['cdn.kryntal.top', 'cdn.watching.onl']);
    expect(await response.text()).toContain('WEBVTT');
});

test('falls back from a reset Mikora resource to its Shiora alternate', async () => {
    const requested: string[] = [];
    const response = await proxyStreamRequest(
        streamRequest('https://vidtub.mikora.top/anime/episode/subtitles/english.vtt'),
        async (target) => {
            requested.push(target.hostname);
            if (target.hostname === 'vidtub.mikora.top') {
                throw new TypeError('socket connection was closed unexpectedly');
            }
            return new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello');
        }
    );

    expect(response.status).toBe(200);
    expect(requested).toEqual(['vidtub.mikora.top', 'vidtub.mikora.top', 'vidtub.shiora.site']);
    expect(await response.text()).toContain('WEBVTT');
});

test('retries a transient Kryntal connection before changing media hosts', async () => {
    const requested: string[] = [];
    let attempts = 0;
    const response = await proxyStreamRequest(
        streamRequest('https://cdn.kryntal.top/anime/episode/subtitles/english.vtt'),
        async (target) => {
            requested.push(target.hostname);
            attempts += 1;
            if (attempts === 1) {
                throw new TypeError('socket connection was closed unexpectedly');
            }
            return new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello');
        }
    );

    expect(response.status).toBe(200);
    expect(requested).toEqual(['cdn.kryntal.top', 'cdn.kryntal.top']);
});

test('unwraps AniKoto TikTok CDN segments into MPEG-TS', async () => {
    const pngEnd = new Uint8Array([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const response = await proxyStreamRequest(
        streamRequest('https://p19-ad-site-sign-sg.tiktokcdn.com/segment.image'),
        async () =>
            new Response(new Uint8Array([...pngEnd, 0x47, 0x00, 0x01]), {
                headers: {
                    'content-type': 'image/png',
                },
            })
    );

    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x47, 0, 1]));
});

test('mirrors Shiora image-named segments to the matching Akirax shard', async () => {
    const response = await proxyStreamRequest(
        streamRequest('https://s3.shiora.top/path/0000.jpg'),
        async (target) => {
            expect(target.hostname).toBe('s3.akirax.buzz');
            return new Response(new Uint8Array([0x47, 0x00, 0x01]), {
                headers: {
                    'content-type': 'image/jpeg',
                },
            });
        }
    );

    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x47, 0, 1]));
});

test('unwraps image-named segments from other allowlisted AniKoto hosts', async () => {
    const response = await proxyStreamRequest(
        streamRequest('https://bb.akirax.buzz/path/segment.png'),
        async () =>
            new Response(
                new Uint8Array([
                    0x89, 0x50, 0x4e, 0x47, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, 0x47,
                    0x00, 0x01,
                ]),
                {
                    headers: {
                        'content-type': 'image/png',
                    },
                }
            )
    );

    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x47, 0, 1]));
});

test('allows AniKoto playlist segments served from TryCloud', async () => {
    const response = await proxyStreamRequest(
        streamRequest('https://feyyb.trycloud.pro/anime/segment-00000.jpg'),
        async () =>
            new Response(new Uint8Array([0x47, 0x40, 0x11]), {
                headers: {
                    'content-type': 'image/jpeg',
                },
            })
    );

    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([0x47, 0x40, 0x11])
    );
});

test('unwraps current Norami JPEG-named segments into MPEG-TS', async () => {
    const response = await proxyStreamRequest(
        streamRequest('https://s2.norami.top/path/0000.jpg'),
        async (target) => {
            expect(target.hostname).toBe('s2.norami.top');
            return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x47, 0x00, 0x01]), {
                headers: {
                    'content-type': 'image/jpeg',
                },
            });
        }
    );

    expect(response.headers.get('content-type')).toBe('video/mp2t');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x47, 0, 1]));
});
