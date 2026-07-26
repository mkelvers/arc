import { describe, expect, test } from 'bun:test';

import {
    formatAudioLabel,
    formatEpisodesAudioLabel,
    mergeAudio,
} from './anime';

describe('audio availability labels', () => {
    test('derives labels from one typed audio field', () => {
        expect(formatAudioLabel(['sub', 'dub'])).toBe('Sub | Dub');
        expect(formatAudioLabel(['sub'])).toBe('Subtitled');
        expect(formatAudioLabel(['dub'])).toBe('Dub');
        expect(formatAudioLabel(['raw'])).toBe('Raw');
        expect(formatAudioLabel([])).toBe('');
    });

    test('aggregates availability without assuming dub implies sub', () => {
        expect(
            formatEpisodesAudioLabel([
                { audio: ['sub'] },
                { audio: ['dub'] },
            ]),
        ).toBe('Sub | Dub');
        expect(
            formatEpisodesAudioLabel([{ audio: ['dub'] }]),
        ).toBe('Dub');
    });

    test('keeps previously verified availability during later refreshes', () => {
        expect(mergeAudio(['sub'], ['dub'])).toEqual(['sub', 'dub']);
        expect(mergeAudio(['sub', 'dub'], ['sub'])).toEqual([
            'sub',
            'dub',
        ]);
    });
});
