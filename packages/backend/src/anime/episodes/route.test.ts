import { describe, expect, test } from 'bun:test';

import { watchEpisodeHref, watchEpisodeNumber } from './route';

describe('watch episode route references', () => {
    test('builds a compact route from the display episode number', () => {
        expect(watchEpisodeHref(177699, 12)).toBe('/anime/177699/watch/12');
        expect(watchEpisodeHref(177699, 0.5)).toBe('/anime/177699/watch/0.5');
    });

    test('parses only finite numeric references', () => {
        expect(watchEpisodeNumber('12')).toBe(12);
        expect(watchEpisodeNumber('0.5')).toBe(0.5);
        expect(watchEpisodeNumber('')).toBeNull();
        expect(watchEpisodeNumber('episode-12')).toBeNull();
        expect(watchEpisodeNumber('Infinity')).toBeNull();
        expect(watchEpisodeNumber('1e2')).toBeNull();
    });
});
