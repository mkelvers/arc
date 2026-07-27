import { describe, expect, test } from 'bun:test';

import {
    audioLabel,
    formatTime,
    hasStreams,
    isHd,
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
});
