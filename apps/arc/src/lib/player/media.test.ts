import { describe, expect, test } from 'bun:test';

import {
    alignSubtitleCues,
    audioLabel,
    formatTime,
    hasDialogueCoverage,
    hasSubtitleTrack,
    hlsTimeline,
    hlsTimelineOffsets,
    isHd,
    isHlsSource,
    orderStreams,
    parseWebVtt,
    sameSubtitleCues,
    subtitleOptionsFor,
    subtitleReferenceTracks,
    subtitlesAt,
    subtitleTracks,
    type Stream,
} from './media';

const streams: Stream[] = [
    { url: '/1080', quality: '1080p', audioDelay: 0 },
    { url: '/720', quality: '720p', audioDelay: 0 },
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
    });

    test('derives concise labels', () => {
        expect(audioLabel('dub')).toBe('English');
        expect(isHd('720p')).toBe(true);
        expect(isHd('480p')).toBe(false);
    });

    test('recognizes direct and proxied HLS sources', () => {
        expect(isHlsSource('https://media.example/master.m3u8?token=1')).toBe(true);
        expect(
            isHlsSource('/api/episodes/stream?url=https%3A%2F%2Fmedia.example%2Fmaster.m3u8')
        ).toBe(true);
        expect(isHlsSource('/api/episodes/stream?url=video.mp4')).toBe(false);
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

    test('prefers fallback subtitles from the active provider', () => {
        const sub: Stream = {
            url: '/anikoto-sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/sub.vtt',
            provider: 'AniKoto',
        };
        const dub: Stream = {
            url: '/anikoto-dub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: null,
            provider: 'AniKoto',
        };
        const unrelated: Stream = {
            ...dub,
            url: '/allanime-dub.mp4',
            provider: 'AllAnime',
        };
        const sources = { sub: [sub], dub: [dub, unrelated] };

        expect(subtitleTracks(sources, 'dub', dub)).toEqual({
            own: null,
            sub: { url: '/sub.vtt', source: sub },
        });
        expect(subtitleTracks(sources, 'dub', unrelated)).toEqual({
            own: null,
            sub: { url: '/sub.vtt', source: sub },
        });
        expect(hasSubtitleTrack(sources, 'dub', dub)).toBe(true);
        expect(hasSubtitleTrack(sources, 'dub', unrelated)).toBe(true);
    });

    test('falls back to an Original track from another provider', () => {
        const sub: Stream = {
            url: '/anineko-sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/sub.vtt',
            provider: 'AniNeko',
        };
        const dub: Stream = {
            url: '/anikoto-dub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: null,
            provider: 'AniKoto',
        };

        expect(subtitleTracks({ sub: [sub], dub: [dub] }, 'dub', dub)).toEqual({
            own: null,
            sub: { url: '/sub.vtt', source: sub },
        });
    });

    test('recognizes a repeated sub VTT in a dub payload', () => {
        const sub: Stream = {
            url: '/sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/shared.vtt',
            provider: 'AniKoto',
        };
        const dub: Stream = {
            url: '/sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/shared.vtt',
            provider: 'AniKoto',
        };

        expect(subtitleTracks({ sub: [sub], dub: [dub] }, 'dub', dub)).toEqual({
            own: null,
            sub: { url: '/shared.vtt', source: sub },
        });
    });

    test('keeps native dub CC separate from the provider sub fallback', () => {
        const sub: Stream = {
            url: '/sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/sub.vtt',
            provider: 'AniKoto',
        };
        const dub: Stream = {
            url: '/dub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/dub.vtt',
            provider: 'AniKoto',
        };

        expect(subtitleTracks({ sub: [sub], dub: [dub] }, 'dub', dub)).toEqual({
            own: { url: '/dub.vtt', source: dub },
            sub: { url: '/sub.vtt', source: sub },
        });
    });

    test('offers alternate timing references without treating them as captions', () => {
        const primary: Stream = {
            url: '/anikoto-sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/anikoto.vtt',
            provider: 'AniKoto',
        };
        const alternative: Stream = {
            url: '/anineko-sub.m3u8',
            quality: null,
            audioDelay: 0,
            subtitleUrl: '/anineko.vtt',
            provider: 'AniNeko',
        };

        expect(
            subtitleReferenceTracks(
                { sub: [primary, alternative] },
                { url: '/anikoto.vtt', source: primary }
            )
        ).toEqual([{ url: '/anineko.vtt', source: alternative }]);
    });

    test('offers every caption track an encode provides, None last', () => {
        expect(subtitleOptionsFor([])).toEqual([{ mode: 'off', label: 'None' }]);
        expect(subtitleOptionsFor(['cc'])).toEqual([
            { mode: 'dub', label: 'English CC' },
            { mode: 'off', label: 'None' },
        ]);
        expect(subtitleOptionsFor(['translated'])).toEqual([
            { mode: 'sub', label: 'Original' },
            { mode: 'off', label: 'None' },
        ]);
        expect(subtitleOptionsFor(['limited'])).toEqual([
            { mode: 'dub', label: 'Signs & Songs' },
            { mode: 'off', label: 'None' },
        ]);
        expect(subtitleOptionsFor(['cc', 'translated'])).toEqual([
            { mode: 'dub', label: 'English CC' },
            { mode: 'sub', label: 'Original' },
            { mode: 'off', label: 'None' },
        ]);
    });

    test('distinguishes dialogue CC from a brittle signs track by coverage', () => {
        expect(hasDialogueCoverage(553, 394)).toBe(true);
        expect(hasDialogueCoverage(319, 394)).toBe(true);
        expect(hasDialogueCoverage(30, 476)).toBe(false);
        expect(hasDialogueCoverage(8, 394)).toBe(false);
        expect(hasDialogueCoverage(30, 0)).toBe(false);
        expect(hasDialogueCoverage(300, 0)).toBe(true);
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
