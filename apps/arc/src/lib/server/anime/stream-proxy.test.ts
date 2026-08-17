import { describe, expect, test } from 'bun:test';

import { proxyStreamRequest, verifyStreamSource } from './stream-proxy';

describe('stream proxy', () => {
    test('only accepts HTTPS provider media hosts', async () => {
        const fetchStream = async () => {
            throw new Error('Provider fetch should not run');
        };

        for (const [target, hostname] of [
            ['http://megap.kotocdn.site/show/master.m3u8', 'megap.kotocdn.site'],
            ['https://127.0.0.1/private', '127.0.0.1'],
            ['https://media.example.net/show/master.m3u8', 'media.example.net'],
        ]) {
            const request = new Request(
                `https://arc.local/api/episodes/stream?${new URLSearchParams({ url: target })}`
            );
            await expect(proxyStreamRequest(request, fetchStream)).rejects.toMatchObject({
                reason: { kind: 'unsupported-host', hostname },
            });
        }
    });

    test('forwards provider media with the required request and response headers', async () => {
        const target = 'https://cdn.mp4upload.com/show/episode.mp4';
        const request = new Request(
            'https://arc.local/api/episodes/stream?src=aHR0cHM6Ly9jZG4ubXA0dXBsb2FkLmNvbS9zaG93L2VwaXNvZGUubXA0',
            { headers: { Range: 'bytes=100-199' } }
        );
        let providerRequest: { target: string; init: RequestInit } | undefined;
        const fetchStream = async (url: URL, init: RequestInit) => {
            providerRequest = { target: url.toString(), init };
            return new Response('video', {
                status: 206,
                headers: {
                    'accept-ranges': 'bytes',
                    'content-range': 'bytes 100-104/1000',
                    'content-type': 'application/octet-stream',
                    etag: 'episode-v1',
                },
            });
        };

        const response = await proxyStreamRequest(request, fetchStream);

        expect({
            target: providerRequest?.target,
            referer: new Headers(providerRequest?.init.headers).get('referer'),
            range: new Headers(providerRequest?.init.headers).get('range'),
            redirect: providerRequest?.init.redirect,
            status: response.status,
            body: await response.text(),
            acceptRanges: response.headers.get('accept-ranges'),
            contentRange: response.headers.get('content-range'),
            contentType: response.headers.get('content-type'),
            etag: response.headers.get('etag'),
        }).toEqual({
            target,
            referer: 'https://www.mp4upload.com',
            range: 'bytes=100-199',
            redirect: 'manual',
            status: 206,
            body: 'video',
            acceptRanges: 'bytes',
            contentRange: 'bytes 100-104/1000',
            contentType: 'video/mp4',
            etag: 'episode-v1',
        });
    });

    test('refuses a provider redirect to an unsupported host', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fcdn.mp4upload.com%2Fepisode.mp4'
        );
        const fetchStream = async () =>
            new Response(null, {
                status: 302,
                headers: { Location: 'https://127.0.0.1/private' },
            });

        await expect(proxyStreamRequest(request, fetchStream)).rejects.toMatchObject({
            reason: { kind: 'unsupported-redirect' },
        });
    });

    test('follows an AnimeGG redirect to its rotating media host', async () => {
        const requests: URL[] = [];
        await expect(
            verifyStreamSource('https://www.animegg.org/play/7/video.mp4', async (target) => {
                requests.push(target);
                if (target.hostname === 'www.animegg.org') {
                    return new Response(null, {
                        status: 302,
                        headers: { location: 'https://s169.vidcache.net:8166/play/7/video.mp4' },
                    });
                }
                return new Response(new Uint8Array([0]), {
                    status: 206,
                    headers: { 'content-type': 'video/mp4' },
                });
            })
        ).resolves.toBeUndefined();
        expect(requests.map(({ hostname }) => hostname)).toEqual([
            'www.animegg.org',
            's169.vidcache.net',
        ]);
    });

    test('rejects an oversized provider playlist', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.kotocdn.site%2Fshow%2Fmaster.m3u8'
        );
        const fetchStream = async () =>
            new Response(null, {
                headers: {
                    'content-length': '1048577',
                    'content-type': 'application/vnd.apple.mpegurl',
                },
            });

        await expect(proxyStreamRequest(request, fetchStream)).rejects.toMatchObject({
            reason: { kind: 'body-too-large', body: 'playlist' },
        });
    });

    test('bounds a provider playlist even without a content-length header', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.kotocdn.site%2Fshow%2Fmaster.m3u8'
        );
        const fetchStream = async () =>
            new Response(new Uint8Array(1024 * 1024 + 1), {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });

        await expect(proxyStreamRequest(request, fetchStream)).rejects.toMatchObject({
            reason: { kind: 'body-too-large', body: 'playlist' },
        });
    });

    test('rewrites allowed playlist references and preserves unlisted hosts', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.shiora.site%2Fshow%2Fmaster.m3u8'
        );
        let providerRequest: RequestInit | undefined;
        const fetchStream = async (_url: URL, init: RequestInit) => {
            providerRequest = init;
            return new Response(
                [
                    '#EXTM3U',
                    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
                    '720/index.m3u8',
                    'https://media.example.net/show/720/index.m3u8',
                ].join('\n'),
                { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
            );
        };

        const response = await proxyStreamRequest(request, fetchStream);

        expect({
            body: await response.text(),
            cacheControl: response.headers.get('cache-control'),
            contentType: response.headers.get('content-type'),
            referer: new Headers(providerRequest?.headers).get('referer'),
        }).toEqual({
            body: [
                '#EXTM3U',
                '#EXT-X-KEY:METHOD=AES-128,URI="/api/episodes/stream?src=aHR0cHM6Ly9tZWdhcC5zaGlvcmEuc2l0ZS9zaG93L2tleS5iaW4"',
                '/api/episodes/stream?src=aHR0cHM6Ly9tZWdhcC5zaGlvcmEuc2l0ZS9zaG93LzcyMC9pbmRleC5tM3U4',
                'https://media.example.net/show/720/index.m3u8',
            ].join('\n'),
            cacheControl: 'no-store',
            contentType: 'application/vnd.apple.mpegurl',
            referer: 'https://megaplay.buzz/',
        });
    });

    test('proxies rotating image-wrapped TikTok segment references', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.shiora.site%2Fshow%2Fmaster.m3u8'
        );
        const fetchStream = async () =>
            new Response(
                [
                    '#EXTM3U',
                    'https://p16-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
                    'https://p19-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
                ].join('\n'),
                { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
            );
        const response = await proxyStreamRequest(request, fetchStream);
        const references = (await response.text()).split('\n').slice(1);

        expect(
            references.map((reference) => {
                const source = new URL(reference, 'https://arc.local').searchParams.get('src');
                return source ? Buffer.from(source, 'base64url').toString('utf8') : null;
            })
        ).toEqual([
            'https://p16-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
            'https://p19-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
        ]);
    });

    test('proxies rotating image-wrapped IByte segment references', async () => {
        const target = 'https://p16-ad-sg.ibyteimg.com/obj/ad-site-i18n-sg/ad.image';
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.shiora.site%2Fshow%2Fmaster.m3u8'
        );
        const fetchStream = async () =>
            new Response(target, {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });

        const response = await proxyStreamRequest(request, fetchStream);

        const reference = await response.text();
        const source = new URL(reference, 'https://arc.local').searchParams.get('src');

        expect(source ? Buffer.from(source, 'base64url').toString('utf8') : null).toBe(target);
    });

    test('unwraps image-disguised transport-stream segments', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fcdn.ibyteimg.com%2Fshow%2Fsegment.png'
        );
        const wrapped = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, 0x47, 0x40,
            0x11,
        ]);
        const fetchStream = async () => new Response(wrapped);

        const response = await proxyStreamRequest(request, fetchStream);

        expect({
            body: [...new Uint8Array(await response.arrayBuffer())],
            contentLength: response.headers.get('content-length'),
            contentType: response.headers.get('content-type'),
        }).toEqual({
            body: [0x47, 0x40, 0x11],
            contentLength: '3',
            contentType: 'video/mp2t',
        });
    });

    test('unwraps image-disguised TikTok transport-stream segments', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fp16-ad-site-sign-sg.tiktokcdn.com%2Fshow%2Fsegment.image'
        );
        const wrapped = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, 0x47, 0x40,
            0x11,
        ]);

        const response = await proxyStreamRequest(request, async () => new Response(wrapped));

        expect({
            body: [...new Uint8Array(await response.arrayBuffer())],
            contentLength: response.headers.get('content-length'),
            contentType: response.headers.get('content-type'),
        }).toEqual({
            body: [0x47, 0x40, 0x11],
            contentLength: '3',
            contentType: 'video/mp2t',
        });
    });

    test('converts AniZone ASS dialogue into WebVTT cues', async () => {
        const response = await proxyStreamRequest(
            new Request(
                `https://arc.local/api/episodes/stream?${new URLSearchParams({
                    url: 'https://seiryuu.vid-cdn.xyz/show/subtitles/0_en.ass',
                })}`
            ),
            async () =>
                new Response(
                    `[Script Info]\nTitle: Example\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\i1}Hello, world!{\\i0}\\NSecond line\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\i1}Hello, world!{\\i0}\\NSecond line\nDialogue: 0,0:00:01.20,0:00:03.45,Effect,,0,0,0,fx,Decorative duplicate\nDialogue: 0,invalid,0:00:04.00,Default,,0,0,0,,Ignored`,
                    { headers: { 'content-type': 'text/plain' } }
                )
        );

        expect(response.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
        expect(await response.text()).toBe(
            'WEBVTT\n\n00:00:01.200 --> 00:00:03.450\nHello, world!\nSecond line\n'
        );
    });

    test('rejects an oversized AniZone subtitle before reading its body', async () => {
        await expect(
            proxyStreamRequest(
                new Request(
                    `https://arc.local/api/episodes/stream?${new URLSearchParams({
                        url: 'https://seiryuu.vid-cdn.xyz/show/subtitles/0_en.ass',
                    })}`
                ),
                async () =>
                    new Response('not read', {
                        headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
                    })
            )
        ).rejects.toMatchObject({
            reason: { kind: 'body-too-large', body: 'subtitle' },
        });
    });

    test('verifies an HLS source through its variant and first media segment', async () => {
        const requests: { target: string; range: string | null }[] = [];
        const fetchStream = async (target: URL, init: RequestInit) => {
            requests.push({
                target: target.toString(),
                range: new Headers(init.headers).get('range'),
            });
            if (target.pathname.endsWith('/master.m3u8')) {
                return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720/index.m3u8', {
                    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                });
            }
            if (target.pathname.endsWith('/720/index.m3u8')) {
                return new Response(
                    '#EXTM3U\n#EXTINF:8.0,\nhttps://p16-ad-site-sign-sg.tiktokcdn.com/show/segment.image',
                    { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
                );
            }

            return new Response(null, { status: 206 });
        };

        await expect(
            verifyStreamSource('https://megap.shiora.site/show/master.m3u8', fetchStream)
        ).resolves.toBeUndefined();
        expect(requests).toEqual([
            {
                target: 'https://megap.shiora.site/show/master.m3u8',
                range: null,
            },
            {
                target: 'https://megap.shiora.site/show/720/index.m3u8',
                range: null,
            },
            {
                target: 'https://p16-ad-site-sign-sg.tiktokcdn.com/show/segment.image',
                range: 'bytes=0-0',
            },
        ]);
    });

    test('rejects an HLS source whose first media segment is unavailable', async () => {
        const fetchStream = async (target: URL) => {
            if (target.pathname.endsWith('/master.m3u8')) {
                return new Response('#EXTM3U\n#EXTINF:8.0,\nsegment.ts', {
                    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                });
            }

            return new Response(null, { status: 403 });
        };

        await expect(
            verifyStreamSource('https://megap.shiora.site/show/master.m3u8', fetchStream)
        ).rejects.toMatchObject({ reason: { kind: 'upstream', status: 403 } });
    });

    test('rejects an HLS source with no playable variant or segment', async () => {
        const fetchStream = async () =>
            new Response('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST', {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });

        await expect(
            verifyStreamSource('https://megap.shiora.site/show/master.m3u8', fetchStream)
        ).rejects.toMatchObject({ reason: { kind: 'invalid-playlist' } });
    });

    test('verifies an AniPub source whose segments rotate to a cloudbuzz media host', async () => {
        const requests: { target: string; referer: string | null; range: string | null }[] = [];
        const fetchStream = async (target: URL, init: RequestInit) => {
            requests.push({
                target: target.toString(),
                referer: new Headers(init.headers).get('referer'),
                range: new Headers(init.headers).get('range'),
            });
            if (target.pathname.endsWith('/master.m3u8')) {
                return new Response(
                    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nindex-f1-v1-a1.m3u8',
                    { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
                );
            }
            if (target.pathname.endsWith('/index-f1-v1-a1.m3u8')) {
                return new Response(
                    '#EXTM3U\n#EXTINF:8.0,\nhttps://q1bog.cloudbuzz.lol/anime/abc/seg-1-f1-v1-a1.css',
                    { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
                );
            }
            return new Response(new Uint8Array([0x47]), { status: 200 });
        };

        await expect(
            verifyStreamSource('https://cdn.watching.onl/anime/abc/master.m3u8', fetchStream)
        ).resolves.toBeUndefined();
        expect(requests).toEqual([
            {
                target: 'https://cdn.watching.onl/anime/abc/master.m3u8',
                referer: 'https://megaplay.buzz/',
                range: null,
            },
            {
                target: 'https://cdn.watching.onl/anime/abc/index-f1-v1-a1.m3u8',
                referer: 'https://megaplay.buzz/',
                range: null,
            },
            {
                target: 'https://q1bog.cloudbuzz.lol/anime/abc/seg-1-f1-v1-a1.css',
                referer: 'https://megaplay.buzz/',
                range: 'bytes=0-0',
            },
        ]);
    });

    test('serves MegaPlay static-disguised MPEG-TS segments as video/mp2t', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fq1bog.cloudbuzz.lol%2Fanime%2Fabc%2Fseg-1-f1-v1-a1.css'
        );
        let providerInit: RequestInit | undefined;
        const fetchStream = async (_target: URL, init: RequestInit) => {
            providerInit = init;
            return new Response(new Uint8Array([0x47, 0x40, 0x11]), {
                headers: { 'content-type': 'text/css' },
            });
        };

        const response = await proxyStreamRequest(request, fetchStream);

        expect({
            body: [...new Uint8Array(await response.arrayBuffer())],
            contentType: response.headers.get('content-type'),
            referer: new Headers(providerInit?.headers).get('referer'),
        }).toEqual({
            body: [0x47, 0x40, 0x11],
            contentType: 'video/mp2t',
            referer: 'https://megaplay.buzz/',
        });
    });

    test('serves every MegaPlay segment CDN as disguised MPEG-TS with its referer', async () => {
        const hosts = [
            'livedns.my',
            'cloudbuzz.lol',
            'sugevideo.xyz',
            'anivideo.sbs',
            'cloudvideo.lat',
            'trycloud.pro',
        ];
        for (const host of hosts) {
            const request = new Request(
                `https://arc.local/api/episodes/stream?url=https%3A%2F%2Fabc.${host}%2Fanime%2Fx%2Fseg-1-f1-v1-a1.jpg`
            );
            let providerInit: RequestInit | undefined;
            const response = await proxyStreamRequest(request, async (_target, init) => {
                providerInit = init;
                return new Response(new Uint8Array([0x47, 0x40, 0x11]), {
                    headers: { 'content-type': 'image/jpeg' },
                });
            });

            expect({
                contentType: response.headers.get('content-type'),
                referer: new Headers(providerInit?.headers).get('referer'),
            }).toEqual({
                contentType: 'video/mp2t',
                referer: 'https://megaplay.buzz/',
            });
        }
    });

    test('allows otakuhg StreamHG hosts with the otakuhg referer', async () => {
        for (const host of ['otakuhg.site', 'abc.premilkyway.com', 'xyz.cdn-centaurus.com']) {
            const request = new Request(
                `https://arc.local/api/episodes/stream?url=https%3A%2F%2F${host}%2Fmaster.m3u8`
            );
            let providerInit: RequestInit | undefined;
            const response = await proxyStreamRequest(request, async (_target, init) => {
                providerInit = init;
                return new Response('#EXTM3U', {
                    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                });
            });

            expect({
                status: response.status,
                referer: new Headers(providerInit?.headers).get('referer'),
            }).toEqual({ status: 200, referer: 'https://otakuhg.site/' });
        }
    });

    test('allows AniZone rotated xin-cdn hosts with the AniZone referer', async () => {
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fsuzaku.xin-cdn.xyz%2Fabc%2Fmaster.m3u8'
        );
        let providerInit: RequestInit | undefined;
        const fetchStream = async (_target: URL, init: RequestInit) => {
            providerInit = init;
            return new Response('#EXTM3U\n#EXT-X-ENDLIST', {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });
        };

        const response = await proxyStreamRequest(request, fetchStream);

        expect({
            contentType: response.headers.get('content-type'),
            referer: new Headers(providerInit?.headers).get('referer'),
        }).toEqual({
            contentType: 'application/vnd.apple.mpegurl',
            referer: 'https://anizone.to/',
        });
    });
});
