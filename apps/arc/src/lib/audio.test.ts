import { describe, expect, test } from 'bun:test';

import { audioAvailabilityLabel, episodeAudioAvailabilityLabel } from '@arc/core';

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
});
