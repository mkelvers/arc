import { describe, expect, test } from 'bun:test';

import {
    episodeAudioModes,
    firstPlayable,
    matchesAniKotoIdentity,
    parseEpisodeList,
    parseMegaPlaySource,
    parseServerList,
    playableAudioModes,
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
                        label: 'English',
                        file: 'https://cdn.kryntal.top/track.vtt',
                    },
                ],
            })?.captions
        ).toHaveLength(1);
    });

    test('skips duplicate and iframe streams', () => {
        const direct = {
            kind: 'direct' as const,
            url: 'https://cdn.kryntal.top/master.m3u8',
            quality: null,
            subtitleUrl: null,
        };
        expect(uniqueDirectStreams([direct, { ...direct }, { ...direct, kind: 'iframe' }])).toEqual(
            [direct]
        );
    });

    test('tries server candidates in order until one is playable', async () => {
        const attempts: string[] = [];
        const stream = await firstPlayable(['dead', 'working'], async (candidate) => {
            attempts.push(candidate);
            if (candidate === 'dead') {
                throw new Error('dead CDN');
            }
            return {
                kind: 'direct',
                url: 'https://megap.akirax.buzz/master.m3u8',
                quality: null,
            };
        });
        expect(attempts).toEqual(['dead', 'working']);
        expect(stream.url).toContain('akirax.buzz');
    });

    test('continues when a candidate has no usable source', async () => {
        const attempts: string[] = [];
        const stream = await firstPlayable(['dead', 'duplicate', 'working'], async (candidate) => {
            attempts.push(candidate);
            if (candidate === 'dead') {
                throw new Error('dead CDN');
            }
            if (candidate === 'duplicate') {
                return null;
            }
            return {
                kind: 'direct',
                url: 'https://megap.akirax.buzz/master.m3u8',
                quality: null,
            };
        });
        expect(attempts).toEqual(['dead', 'duplicate', 'working']);
        expect(stream.url).toContain('akirax.buzz');
    });
});
