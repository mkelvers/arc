import { describe, expect, test } from 'bun:test';

import {
    alignSubtitleCues,
    formatTime,
    hlsTimeline,
    hlsTimelineOffsets,
    isHd,
    isHlsSource,
    orderStreams,
    parseWebVtt,
    playbackStartTarget,
    sameSubtitleCues,
    seekTarget,
    subtitleOptionsFor,
    subtitleTracks,
    subtitlesAt,
    type Stream,
} from './media';

const streams: Stream[] = [
    { provider: 'anikoto', server: 'VidPlay-1', url: '/1080', quality: '1080p', subtitles: [] },
    { provider: 'anikoto', server: 'HD-2', url: '/720', quality: '720p', subtitles: [] },
];

describe('player media helpers', () => {
    test('formats short and long durations without wrapping punctuation', () => {
        expect(formatTime(65)).toBe('1:05');
        expect(formatTime(3_600)).toBe('1h');
        expect(formatTime(7_500)).toBe('2h, 5m');
    });

    test('moves a selected quality ahead of fallbacks', () => {
        expect(orderStreams(streams, '720p').map(({ url }) => url)).toEqual(['/720', '/1080']);
        expect(orderStreams(streams, 'best')).toBe(streams);

        expect(
            orderStreams(
                [
                    {
                        provider: 'anikoto',
                        server: 'HD-2',
                        url: '/slow.mp4',
                        quality: '480p',
                        subtitles: [],
                    },
                    {
                        provider: 'anikoto',
                        server: 'VidPlay-1',
                        url: '/adaptive.m3u8',
                        quality: null,
                        subtitles: [],
                    },
                ],
                'best'
            ).map(({ url }) => url)
        ).toEqual(['/adaptive.m3u8', '/slow.mp4']);
    });

    test('bases rapid seeks on the latest logical target', () => {
        let currentTime = 120;

        for (const delta of [-10, -10, 10, -10, 10, 10]) {
            currentTime = seekTarget(currentTime, delta, 1_420);
        }

        expect(currentTime).toBe(120);
    });

    test('clamps seek targets to the media duration', () => {
        expect(seekTarget(5, -10, 100)).toBe(0);
        expect(seekTarget(95, 10, 100)).toBe(100);
    });

    test('keeps the saved start time across an initial zero-position source fallback', () => {
        expect(playbackStartTarget(891, 0, false)).toBe(891);
        expect(playbackStartTarget(891, 42, true)).toBe(42);
    });

    test('derives concise labels', () => {
        expect(isHd('720p')).toBe(true);
        expect(isHd('480p')).toBe(false);
    });

    test('recognizes HLS sources', () => {
        const encodeSource = (source: string) =>
            btoa(source).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

        expect(isHlsSource('https://media.example/master.m3u8?token=1')).toBe(true);
        expect(
            isHlsSource(`/v1/stream?src=${encodeSource('https://media.example/master.m3u8')}`)
        ).toBe(true);
        expect(isHlsSource('https://media.example/video.mp4')).toBe(false);
        expect(
            isHlsSource(`/v1/stream?src=${encodeSource('https://media.example/video.mp4')}`)
        ).toBe(false);
    });

    test('parses and selects overlapping WebVTT captions', () => {
        const cues = parseWebVtt(`
WEBVTT

00:06.060 --> 00:11.810
"I want to go on <i>living</i>
even after my death!"

1
01:52.510 --> 01:53.910 align:center
Yeah &amp; cheers!

01:52.880 --> 01:54.750
Cheers!
`);

        expect(cues).toHaveLength(3);
        expect(subtitlesAt(cues, 7)).toEqual(['"I want to go on living\neven after my death!"']);
        expect(subtitlesAt(cues, 113)).toEqual(['Yeah & cheers!', 'Cheers!']);
    });

    test('offers every validated caption variant in preferred order with Off last', () => {
        expect(subtitleOptionsFor([])).toEqual([{ mode: 'off', label: 'Off' }]);
        expect(subtitleOptionsFor(['full', 'sdh', 'forced'])).toEqual([
            { mode: 'full', label: 'English' },
            { mode: 'sdh', label: 'English SDH' },
            { mode: 'forced', label: 'English Forced' },
            { mode: 'off', label: 'Off' },
        ]);
        expect(subtitleOptionsFor(['translated'])).toEqual([
            { mode: 'translated', label: 'Original translation' },
            { mode: 'off', label: 'Off' },
        ]);
        expect(subtitleOptionsFor(['full', 'translated'])).toEqual([
            { mode: 'full', label: 'English' },
            { mode: 'translated', label: 'Original translation' },
            { mode: 'off', label: 'Off' },
        ]);
    });

    test('uses same-provider translated captions only when a dub has no native track', () => {
        const sub: Stream = {
            provider: 'anikoto',
            server: 'VidPlay-1',
            url: '/sub',
            quality: null,
            subtitles: [{ kind: 'full', url: '/sub.vtt' }],
        };
        const dub: Stream = {
            provider: 'anikoto',
            server: 'HD-2',
            url: '/dub',
            quality: null,
            subtitles: [],
        };
        expect(subtitleTracks({ sub: [sub], dub: [dub] }, 'dub', dub).sub).toMatchObject({
            kind: 'translated',
            url: '/sub.vtt',
            source: sub,
        });
        expect(
            subtitleTracks(
                {
                    sub: [sub],
                    dub: [{ ...dub, subtitles: [{ kind: 'full', url: '/dub.vtt' }] }],
                },
                'dub',
                { ...dub, subtitles: [{ kind: 'full', url: '/dub.vtt' }] }
            ).sub
        ).toBeNull();
    });

    test('reads HLS variants and segment boundaries', () => {
        expect(hlsTimeline(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvideo/index.m3u8`)).toEqual({
            variant: 'video/index.m3u8',
            boundaries: null,
        });
        expect(hlsTimeline(`#EXTM3U\n#EXTINF:3.5,\na\n#EXTINF:4.25,\nb\n#EXTINF:2.0,\nc`)).toEqual({
            variant: null,
            boundaries: [3.5, 7.75],
        });
    });

    test('calibrates a sub track from matching HLS content boundaries', () => {
        const reference = Array.from(
            { length: 120 },
            (_, index) => 1.2 + ((index * 37) % 43) / 10 + (index % 7) * 0.013
        ).reduce<number[]>((boundaries, duration) => {
            boundaries.push((boundaries.at(-1) ?? 0) + duration);
            return boundaries;
        }, []);
        const offset = 15.974;
        const target = reference
            .filter((_, index) => index % 3 !== 0)
            .map((boundary) => boundary + offset);

        expect(hlsTimelineOffsets(reference, target)[0]?.offset).toBeCloseTo(offset, 2);
        expect(
            alignSubtitleCues([{ start: 28.34, end: 30.7, text: 'Mommy!' }], [{ at: 0, offset }])
        ).toEqual([{ start: 44.314, end: 46.674, text: 'Mommy!' }]);
    });

    test('aligns captions across multiple encode edits', () => {
        const reference = Array.from(
            { length: 420 },
            (_, index) => 1.5 + ((index * 29) % 37) / 10
        ).reduce<number[]>((boundaries, duration) => {
            boundaries.push((boundaries.at(-1) ?? 0) + duration);
            return boundaries;
        }, []);
        const target = [
            3,
            7,
            11,
            ...reference.map(
                (boundary) => boundary + (boundary < 220 ? 15 : boundary < 610 ? 24 : 29)
            ),
        ].toSorted((left, right) => left - right);

        const offsets = hlsTimelineOffsets(reference, target);
        expect(offsets).toHaveLength(3);
        expect(offsets.map(({ offset }) => offset)).toEqual([15, 24, 29]);

        expect(
            alignSubtitleCues(
                [
                    { start: 100, end: 102, text: 'Early' },
                    { start: 400, end: 402, text: 'Middle' },
                    { start: 800, end: 802, text: 'Late' },
                ],
                offsets
            )
        ).toEqual([
            { start: 115, end: 117, text: 'Early' },
            { start: 424, end: 426, text: 'Middle' },
            { start: 829, end: 831, text: 'Late' },
        ]);
    });

    test('requires equivalent cues before using another timing reference', () => {
        const cues = [{ start: 1, end: 2, text: 'A line' }];

        expect(sameSubtitleCues(cues, [{ start: 1.005, end: 2.005, text: 'A line' }])).toBe(true);
        expect(sameSubtitleCues(cues, [{ start: 1, end: 2, text: 'A different line' }])).toBe(
            false
        );
    });

    test('fails closed for sparse or unrelated HLS timelines', () => {
        expect(hlsTimelineOffsets([1, 2, 3], [17, 18, 19])).toEqual([]);

        const reference = Array.from({ length: 80 }, (_, index) => index * 4.1);
        const unrelated = Array.from(
            { length: 80 },
            (_, index) => index * 3.7 + (index % 5) * 0.13
        );
        expect(hlsTimelineOffsets(reference, unrelated)).toEqual([]);
    });
});
