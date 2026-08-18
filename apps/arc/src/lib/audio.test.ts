import { describe, expect, test } from 'bun:test';

import { audioAvailabilityLabel, episodeAudioAvailabilityLabel, mergeAudioModes } from './audio';

describe('audio availability labels', () => {
    test('derives labels from normalized audio modes', () => {
        expect(audioAvailabilityLabel(['dub', 'sub', 'dub'])).toBe('Dub | Sub');
        expect(audioAvailabilityLabel(['sub'])).toBe('Subtitled');
        expect(audioAvailabilityLabel(['dub'])).toBe('Dubbed');
        expect(audioAvailabilityLabel(['raw'])).toBe('Subtitled');
        expect(audioAvailabilityLabel(['dub', 'raw'])).toBe('Dub | Sub');
        expect(audioAvailabilityLabel([])).toBe('');
    });

    test('aggregates availability without assuming dub implies sub', () => {
        expect(episodeAudioAvailabilityLabel([{ audio: ['sub'] }, { audio: ['dub'] }])).toBe(
            'Dub | Sub'
        );
        expect(episodeAudioAvailabilityLabel([{ audio: ['dub'] }])).toBe('Dubbed');
    });

    test('keeps previously verified availability during later refreshes', () => {
        expect(mergeAudioModes(['sub'], ['dub'])).toEqual(['sub', 'dub']);
        expect(mergeAudioModes(['sub', 'dub'], ['sub'])).toEqual(['sub', 'dub']);
    });
});
