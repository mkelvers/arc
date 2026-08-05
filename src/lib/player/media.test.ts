import { describe, expect, test } from 'bun:test';

import {
    audioLabel,
    formatTime,
    hasStreams,
    isHd,
    isHlsSource,
    orderStreams,
    parseWebVtt,
    qualityLabel,
    sameLine,
    mergeSubtitleTracks,
    subtitlesAt,
    subtitleTracks,
    subtitlesFor,
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
        expect(orderStreams(streams, '720p').map(({ url }) => url)).toEqual([
            '/720',
            '/1080',
        ]);
        expect(orderStreams(streams, 'best')).toBe(streams);
    });

    test('derives concise labels', () => {
        expect(audioLabel('dub')).toBe('English');
        expect(qualityLabel('best', '1080p')).toBe('Auto 1080p');
        expect(isHd('720p')).toBe(true);
        expect(isHd('480p')).toBe(false);
    });

    test('accepts every audio mode supported by the player', () => {
        expect(hasStreams({ raw: streams })).toBe(true);
        expect(hasStreams({})).toBe(false);
    });

    test('recognizes direct and proxied HLS sources', () => {
        expect(
            isHlsSource('https://media.example/master.m3u8?token=1'),
        ).toBe(true);
        expect(
            isHlsSource(
                '/api/watch/stream?url=https%3A%2F%2Fmedia.example%2Fmaster.m3u8',
            ),
        ).toBe(true);
        expect(isHlsSource('/api/watch/stream?url=video.mp4')).toBe(
            false,
        );
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
        expect(subtitlesAt(cues, 7)).toEqual([
            '"I want to go on living\neven after my death!"',
        ]);
        expect(subtitlesAt(cues, 113)).toEqual([
            'Yeah & cheers!',
            'Cheers!',
        ]);
    });

    test('exposes the active track and the sub fallback separately', () => {
        const captioned: Stream = {
            url: '/sub',
            quality: null,
            audioDelay: 0,
            subtitleUrl: 'https://media.example/sub.vtt',
        };
        const uncaptioned: Stream = {
            url: '/dub',
            quality: null,
            audioDelay: 0,
            subtitleUrl: null,
        };
        const sources = { sub: [captioned], dub: [uncaptioned] };

        expect(subtitleTracks(sources, uncaptioned)).toEqual({
            own: null,
            sub: 'https://media.example/sub.vtt',
        });
        expect(subtitleTracks(sources, captioned)).toEqual({
            own: 'https://media.example/sub.vtt',
            sub: 'https://media.example/sub.vtt',
        });
        expect(subtitleTracks({ dub: [uncaptioned] }, uncaptioned)).toEqual({
            own: null,
            sub: null,
        });
    });

    test('classifies lines that say the same thing', () => {
        expect(sameLine('Nezuko, don\'t die!', 'Nezuko, don\'t die!')).toBe(
            true,
        );
        expect(
            sameLine(
                'Nezuko, don\'t die!',
                'Nezuko, don\'t die! Don\'t die on me!',
            ),
        ).toBe(true);
        expect(sameLine('How?', 'Boy: How?')).toBe(true);
        expect(sameLine('How?', 'How did this happen?')).toBe(false);
        expect(sameLine('Run!', 'Don\'t stop!')).toBe(false);
    });

    test('ignores punctuation and speaker labels in line comparisons', () => {
        expect(
            sameLine('I won\'t let you die!', 'I won\'t let you die.'),
        ).toBe(true);
        expect(sameLine('Tanjiro?', 'Woman: Tanjiro.')).toBe(true);
        expect(
            sameLine(
                'Your face is covered in soot.',
                'Your face is all covered in soot.',
            ),
        ).toBe(true);
        expect(
            sameLine(
                'Come on, Nezuko!',
                'Nezuko, don\'t die! Don\'t die on me!',
            ),
        ).toBe(false);
        expect(
            sameLine(
                'Are you going to town again today?',
                'You\'re going to town again today?',
            ),
        ).toBe(false);
    });

    test('merges tracks with dub precedence on same lines', () => {
        const dub = [
            { start: 0, end: 10, text: 'Boy: How?' },
            { start: 20, end: 30, text: 'Sign' },
        ];
        const sub = [
            { start: 2, end: 8, text: 'How?' },
            {
                start: 25,
                end: 35,
                text: 'Nezuko, don\'t die!',
            },
            { start: 40, end: 50, text: 'Gojou Satoru.' },
        ];

        const merged = mergeSubtitleTracks(dub, sub);
        const texts = merged.map(({ text }) => text);
        expect(texts).toContain('Boy: How?');
        expect(texts).not.toContain('How?');
        expect(texts).toContain('Sign');
        expect(texts).toContain('Nezuko, don\'t die!');
        expect(texts).toContain('Gojou Satoru.');
        expect(merged).toEqual([
            ...merged,
        ].toSorted((left, right) => left.start - right.start));
    });

    test('keeps only the preferred cue for identical overlapping lines', () => {
        const preferred = [
            { start: 0, end: 10, text: 'Same line' },
        ];
        const alternate = [
            { start: 2, end: 8, text: 'Same line' },
        ];

        expect(mergeSubtitleTracks(preferred, alternate)).toEqual(
            preferred,
        );
    });

    test('dedupes overlapping lines that differ only in punctuation', () => {
        const dub = [
            { start: 0, end: 10, text: 'I won\'t let you die.' },
        ];
        const sub = [
            { start: 2, end: 8, text: 'I won\'t let you die!' },
        ];

        expect(mergeSubtitleTracks(dub, sub)).toEqual(dub);
    });

    test('selects subtitle tracks by the preferred mode', () => {
        const own = [{ start: 0, end: 10, text: 'Dub line' }];
        const sub = [{ start: 0, end: 10, text: 'Sub line' }];

        expect(subtitlesFor('dub', own, sub)).toBe(own);
        expect(subtitlesFor('dub', null, sub)).toBe(sub);
        expect(subtitlesFor('sub', own, sub)).toBe(sub);
        expect(subtitlesFor('sub', own, null)).toBe(own);
        expect(subtitlesFor('merge', null, sub)).toBe(sub);
        expect(subtitlesFor('merge', own, null)).toBe(own);
        expect(subtitlesFor('merge', null, null)).toBeNull();
    });

    test('merge mode keeps both tracks with dub precedence', () => {
        const own = [{ start: 0, end: 10, text: 'Boy: How?' }];
        const sub = [
            { start: 2, end: 8, text: 'How?' },
            { start: 20, end: 30, text: 'Standalone' },
        ];

        const merged = subtitlesFor('merge', own, sub)!;
        expect(merged.map(({ text }) => text)).toEqual([
            'Boy: How?',
            'Standalone',
        ]);
    });
});
