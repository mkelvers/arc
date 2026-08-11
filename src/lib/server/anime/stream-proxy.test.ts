import { describe, expect, test } from 'bun:test';

import { proxyStreamRequest } from './stream-proxy';

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

    test('keeps TikTok ad references direct without warning about an unlisted host', async () => {
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
        const warning = console.warn;
        const warnings: string[] = [];
        console.warn = (message: string) => warnings.push(message);

        try {
            const response = await proxyStreamRequest(request, fetchStream);

            expect(await response.text()).toBe(
                [
                    '#EXTM3U',
                    'https://p16-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
                    'https://p19-ad-site-sign-sg.tiktokcdn.com/video/ad.mp4',
                ].join('\n')
            );
            expect(warnings).toEqual([]);
        } finally {
            console.warn = warning;
        }
    });

    test('keeps rotating IByte ad references direct', async () => {
        const target = 'https://p16-ad-sg.ibyteimg.com/obj/ad-site-i18n-sg/ad.image';
        const request = new Request(
            'https://arc.local/api/episodes/stream?url=https%3A%2F%2Fmegap.shiora.site%2Fshow%2Fmaster.m3u8'
        );
        const fetchStream = async () =>
            new Response(target, {
                headers: { 'content-type': 'application/vnd.apple.mpegurl' },
            });

        const response = await proxyStreamRequest(request, fetchStream);

        expect(await response.text()).toBe(target);
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
});
