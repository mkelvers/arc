import { describe, expect, test } from 'bun:test';

import {
    episodeAudioModes,
    aniKotoMediaCandidates,
    fetchAniKotoResource,
    isAniKotoDisguisedSegmentHost,
    matchesAniKotoIdentity,
    normalizeAniKotoMediaUrl,
    parseAniKotoCatalogPage,
    parseEpisodeList,
    parseMegaPlaySource,
    parseSeries,
    parseServerList,
    playableAudioModes,
    resolveCandidates,
    unwrapAniKotoDisguisedSegment,
    validateAniKotoMedia,
    serverMode,
    supportedMediaUrl,
    supportedSubtitleUrl,
    uniqueDirectStreams,
    validEmbed,
    validOpaqueId,
} from './anikoto';

describe('AniKoto provider rules', () => {
    test('fails closed for malformed provider payloads', () => {
        expect(parseEpisodeList(null)).toEqual([]);
        expect(parseEpisodeList({ status: 200, result: 42 })).toEqual([]);
        expect(parseServerList({ status: 500, result: '<div></div>' })).toEqual({
            sub: [],
            dub: [],
        });
        expect(
            parseServerList({
                status: 200,
                result: `<div class="type" data-type="hsub"><ul><li data-link-id="same-id">HD-1</li></ul></div>
                    <div class="type" data-type="sub"><ul><li data-link-id="same-id">SUB-1</li></ul></div>`,
            })
        ).toEqual({
            sub: [{ mode: 'sub', embedMode: 'hsub', linkId: 'same-id', label: 'HD-1' }],
            dub: [],
        });
        expect(
            parseServerList({
                status: 200,
                result: '<div class="type" data-type="hsub"><ul><li data-link-id="hsub-id">HD-1</li></ul></div>',
            })
        ).toEqual({
            sub: [{ mode: 'sub', embedMode: 'hsub', linkId: 'hsub-id', label: 'HD-1' }],
            dub: [],
        });
        expect(parseMegaPlaySource({ sources: { file: 'not a URL' } })).toBeNull();
    });

    test('keeps AniKoto opaque IDs and classifies audio modes', () => {
        const encoded = 'MTF1dkFtaW9BRTZPbzJJRElFZUZrOWdjeldjOERL...';
        expect(validOpaqueId(encoded)).toBe(encoded);
        expect(validOpaqueId('')).toBeNull();
        expect(episodeAudioModes('1', '1')).toEqual(['sub', 'dub']);
        expect(episodeAudioModes('1', '0')).toEqual(['sub']);
        expect(playableAudioModes(['sub'], ['sub', 'dub', 'raw'])).toEqual(['sub']);
        expect(playableAudioModes(['dub'], ['sub', 'dub'])).toEqual(['dub']);
        expect(serverMode('sub')).toBe('sub');
        expect(serverMode('hsub')).toBe('hsub');
        expect(serverMode('dub')).toBe('dub');
        expect(serverMode('raw')).toBeNull();
    });

    test('requires confirmed AniList identity', () => {
        expect(
            matchesAniKotoIdentity(
                { anilistId: 176496, malId: 58567 },
                { id: 176496, idMal: 58567 }
            )
        ).toBe(true);
        expect(
            matchesAniKotoIdentity({ anilistId: 123, malId: 58567 }, { id: 176496, idMal: 58567 })
        ).toBe(false);
        expect(
            matchesAniKotoIdentity({ anilistId: null, malId: 58567 }, { id: 176496, idMal: 58567 })
        ).toBe(true);
        expect(
            matchesAniKotoIdentity({ anilistId: null, malId: 123 }, { id: 176496, idMal: 58567 })
        ).toBe(false);
        expect(
            matchesAniKotoIdentity({ anilistId: 51297, malId: 51297 }, { id: 146493, idMal: 51297 })
        ).toBe(true);
        expect(
            matchesAniKotoIdentity({ anilistId: 123, malId: 58567 }, { id: 146493, idMal: 58567 })
        ).toBe(false);
    });

    test('reads the seasonal catalog and excludes adult entries', () => {
        expect(
            parseAniKotoCatalogPage(`
                <div id="list-items">
                    <div class="item"><div class="poster" data-tip="8873"></div></div>
                    <div class="item"><div class="poster" data-tip="8873"></div></div>
                    <div class="item"><div class="poster" data-tip="8910"><div class="adult"></div></div></div>
                    <div class="item"><div class="poster" data-tip="not-an-id"></div></div>
                </div>
                <ul class="pagination"><li><a rel="next" href="?page=2">Next</a></li></ul>
            `)
        ).toEqual({ providerIds: [8873], hasNextPage: true });
        expect(parseAniKotoCatalogPage('<div id="list-items"></div>')).toEqual({
            providerIds: [],
            hasNextPage: false,
        });
    });

    test('builds seasonal card metadata from a validated AniKoto series', () => {
        expect(
            parseSeries({
                ok: true,
                data: {
                    anime: {
                        id: 8873,
                        ani_id: '209983',
                        mal_id: '63817',
                        title: 'Provider title',
                        alternative: 'Alternative title',
                        poster: 'https://img.animeschedule.net/production/assets/public/img/anime/jpg/default/provider.jpg',
                        description: '<p>A seasonal <b>release</b>.</p>',
                        score: '7.27',
                        is_sub: 9,
                        is_dub: 4,
                        status: 'Currently Airing',
                        terms_by_type: { genre: ['Action', 'Fantasy'], type: ['TV'] },
                    },
                    episodes: [],
                },
            })
        ).toMatchObject({
            id: 8873,
            anilistId: 209983,
            title: 'Provider title',
            synopsis: 'A seasonal release.',
            score: 73,
            genres: ['Action', 'Fantasy'],
            format: 'TV',
            status: 'RELEASING',
            audio: ['sub', 'dub'],
        });
        expect(
            parseSeries({
                ok: true,
                data: {
                    anime: {
                        id: 8873,
                        title: 'Missing image',
                        poster: 'http://insecure.test/x.jpg',
                    },
                    episodes: [],
                },
            })?.image
        ).toBeNull();
    });

    test('accepts only supported HTTPS media and subtitle URLs', () => {
        expect(supportedMediaUrl('http://cdn.kryntal.top/master.m3u8')).toBeNull();
        expect(supportedMediaUrl('https://evil.example/master.m3u8')).toBeNull();
        expect(supportedMediaUrl('https://cdn.kryntal.top/master.m3u8')?.hostname).toBe(
            'cdn.kryntal.top'
        );
        expect(supportedMediaUrl('https://megap.akirax.buzz/video.mp4')?.hostname).toBe(
            'megap.akirax.buzz'
        );
        expect(supportedMediaUrl('https://megap.shiora.site/video.m3u8')?.hostname).toBe(
            'megap.shiora.site'
        );
        expect(
            aniKotoMediaCandidates(new URL('https://megap.shiora.top/video.m3u8')).map(
                (candidate) => candidate.hostname
            )
        ).toEqual(['megap.shiora.top', 'megap.shiora.site']);
        expect(
            aniKotoMediaCandidates(new URL('https://cdn.kryntal.top/video.m3u8')).map(
                (candidate) => candidate.hostname
            )
        ).toEqual(['cdn.kryntal.top', 'cdn.watching.onl', 'ncdn.watching.onl']);
        expect(normalizeAniKotoMediaUrl(new URL('https://s2.norami.top/video.jpg'))?.hostname).toBe(
            's2.norami.top'
        );
        expect(
            normalizeAniKotoMediaUrl(new URL('https://s2.shiora.site/video.jpg'))?.hostname
        ).toBe('s2.akirax.buzz');
        expect(isAniKotoDisguisedSegmentHost('s2.shiora.site')).toBe(true);
        expect(supportedSubtitleUrl('https://cdn.kryntal.top/track.ass')).toBeNull();
        expect(supportedSubtitleUrl('https://cdn.kryntal.top/track.vtt')?.pathname).toBe(
            '/track.vtt'
        );
    });

    test('rejects iframe embeds and unsupported source payloads', () => {
        expect(validEmbed('https://megaplay.buzz/embed/2649', 'sub')).toBeNull();
        expect(validEmbed('https://megaplay.buzz/stream/s-2/131394/dub', 'sub')).toBeNull();
        expect(
            validEmbed(
                'https://vidtube.site/stream/M0FNUDVvNjVNYU5FUnlPMWk1VkE1TUlxcVl3TlJ3VHp5b0tiODBlS2hDL1VVMThhdllHNnIxbGJkbnNyYURWYUpFWU9jdVRUaUxPVTlRYVVidU0xNFE9PQ/sub',
                'sub'
            )
        ).not.toBeNull();
        expect(validEmbed('https://megaplay.buzz/stream/s-2/815275/hsub', 'hsub')).not.toBeNull();
        expect(
            parseMegaPlaySource({
                sources: { file: 'https://cdn.kryntal.top/master.m3u8' },
                tracks: [
                    {
                        kind: 'captions',
                        label: 'English',
                        file: 'https://cdn.kryntal.top/track.vtt',
                    },
                    {
                        kind: 'captions',
                        label: 'English SDH',
                        file: 'https://cdn.kryntal.top/sdh.vtt',
                    },
                    {
                        kind: 'captions',
                        label: 'English Forced',
                        file: 'https://cdn.kryntal.top/forced.vtt',
                    },
                ],
            })?.captions
        ).toEqual([
            { kind: 'full', url: 'https://cdn.kryntal.top/track.vtt', preferred: false },
            { kind: 'sdh', url: 'https://cdn.kryntal.top/sdh.vtt', preferred: false },
            { kind: 'forced', url: 'https://cdn.kryntal.top/forced.vtt', preferred: false },
        ]);
    });

    test('removes duplicate direct streams while keeping the first server label', () => {
        const direct = {
            provider: 'anikoto',
            server: 'VidPlay-1',
            url: 'https://cdn.kryntal.top/master.m3u8',
            quality: null,
            subtitles: [],
        };
        expect(uniqueDirectStreams([direct, { ...direct }, { ...direct, server: 'HD-2' }])).toEqual(
            [direct]
        );
    });

    test('validates the HLS master, media playlist, and initial segment', async () => {
        const requested: string[] = [];
        await validateAniKotoMedia(
            new URL('https://cdn.kryntal.top/episode/master.m3u8'),
            async (target) => {
                requested.push(target.toString());
                if (target.pathname.endsWith('master.m3u8')) {
                    return new Response(
                        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvideo/index.m3u8',
                        { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }
                    );
                }
                if (target.pathname.endsWith('index.m3u8')) {
                    return new Response('#EXTM3U\n#EXTINF:4,\nsegment.ts', {
                        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                    });
                }
                return new Response(new Uint8Array([0x47, 0x00, 0x01, 0x02]), {
                    headers: { 'content-type': 'video/mp2t' },
                });
            }
        );
        expect(requested).toEqual([
            'https://cdn.kryntal.top/episode/master.m3u8',
            'https://cdn.kryntal.top/episode/video/index.m3u8',
            'https://cdn.kryntal.top/episode/video/segment.ts',
        ]);
    });

    test('retries transient media connection failures', async () => {
        let attempts = 0;
        const result = await fetchAniKotoResource(
            new URL('https://cdn.kryntal.top/episode/master.m3u8'),
            async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw Object.assign(
                        new TypeError('The socket connection was closed unexpectedly'),
                        { code: 'ECONNRESET' }
                    );
                }
                return new Response('#EXTM3U');
            }
        );
        expect(result.response.status).toBe(200);
        expect(attempts).toBe(3);
    });

    test('unwraps JPEG-disguised HLS segments from current AniKoto shards', async () => {
        const segment = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x47, 0x00, 0x01, 0x02]);
        expect(unwrapAniKotoDisguisedSegment(segment)).toEqual(
            new Uint8Array([0x47, 0x00, 0x01, 0x02])
        );
        expect(unwrapAniKotoDisguisedSegment(new Uint8Array([0x47, 0xff, 0xd9, 0x00]))).toEqual(
            new Uint8Array([0x47, 0xff, 0xd9, 0x00])
        );

        await validateAniKotoMedia(
            new URL('https://s1.akirax.buzz/episode/master.m3u8'),
            async (target) => {
                if (target.pathname.endsWith('master.m3u8')) {
                    return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvideo/index.m3u8');
                }
                if (target.pathname.endsWith('index.m3u8')) {
                    return new Response('#EXTM3U\n#EXTINF:4,\nhttps://s2.norami.top/segment.jpg');
                }
                return new Response(segment, { headers: { 'content-type': 'image/jpeg' } });
            }
        );
    });

    test('validates an MP4 range and cools down only the failed source URL', async () => {
        const failed = new URL('https://cdn.kryntal.top/dead.mp4');
        let failedAttempts = 0;
        const deadFetch = async () => {
            failedAttempts += 1;
            return new Response('upstream failed', { status: 503 });
        };
        await expect(validateAniKotoMedia(failed, deadFetch)).rejects.toThrow();
        await expect(validateAniKotoMedia(failed, deadFetch)).rejects.toThrow('cooling down');
        expect(failedAttempts).toBe(1);

        const sibling = new URL('https://cdn.kryntal.top/sibling.mp4');
        await validateAniKotoMedia(sibling, async (_target, init) => {
            expect(new Headers(init.headers).get('Range')).toBe('bytes=0-65535');
            return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
                status: 206,
                headers: { 'content-type': 'video/mp4' },
            });
        });
    });

    test('resolves every candidate independently with four workers and preserves order', async () => {
        const active: string[] = [];
        let maximum = 0;
        const result = await resolveCandidates(
            ['dead', 'one', 'two', 'three', 'four', 'five'],
            async (candidate) => {
                active.push(candidate);
                maximum = Math.max(maximum, active.length);
                await new Promise((resolve) => setTimeout(resolve, candidate === 'dead' ? 5 : 1));
                active.splice(active.indexOf(candidate), 1);
                if (candidate === 'dead') {
                    throw new Error('dead CDN');
                }
                return candidate === 'three' ? null : candidate;
            },
            { concurrency: 4 }
        );

        expect(maximum).toBe(4);
        expect(result.results).toEqual([null, 'one', 'two', null, 'four', 'five']);
        expect(result.errors).toHaveLength(1);
    });
});
