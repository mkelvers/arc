import { describe, expect, test } from 'bun:test';

import {
    audioLabel,
    formatTime,
    hasStreams,
    isHd,
    isHlsSource,
    orderStreams,
    qualityLabel,
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
});
