import { describe, expect, test } from 'bun:test';

import {
    audioAvailabilityLabel,
    episodeAudioAvailabilityLabel,
    mergeAudioModes,
} from './audio';

describe('audio availability labels', () => {
    test('derives labels from normalized audio modes', () => {
        expect(audioAvailabilityLabel(['dub', 'sub', 'dub'])).toBe('Sub | Dub');
        expect(audioAvailabilityLabel(['sub'])).toBe('Sub');
        expect(audioAvailabilityLabel(['dub'])).toBe('Dub');
        expect(audioAvailabilityLabel(['raw'])).toBe('Raw');
        expect(audioAvailabilityLabel([])).toBe('');
    });

    test('aggregates availability without assuming dub implies sub', () => {
        expect(
            episodeAudioAvailabilityLabel([
                { audio: ['sub'] },
                { audio: ['dub'] },
            ]),
        ).toBe('Sub | Dub');
        expect(episodeAudioAvailabilityLabel([{ audio: ['dub'] }])).toBe(
            'Dub',
        );
    });

    test('keeps previously verified availability during later refreshes', () => {
        expect(mergeAudioModes(['sub'], ['dub'])).toEqual(['sub', 'dub']);
        expect(mergeAudioModes(['sub', 'dub'], ['sub'])).toEqual([
            'sub',
            'dub',
        ]);
    });
});
