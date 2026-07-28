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
    subtitlesAt,
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
});
