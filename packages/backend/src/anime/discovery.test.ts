import { describe, expect, test } from 'bun:test';

import { isDiscoverableAnime } from './discovery';

describe('anime discovery catalog', () => {
    test('admits normal TV and streaming anime with an established audience', () => {
        expect(isDiscoverableAnime({ format: 'TV', popularity: 2_000, duration: 24 })).toBe(true);
        expect(isDiscoverableAnime({ format: 'ONA', popularity: 3_000, duration: null })).toBe(
            true
        );
    });

    test('rejects database noise from passive discovery', () => {
        expect(isDiscoverableAnime({ format: 'TV_SHORT', popularity: 50_000, duration: 4 })).toBe(
            false
        );
        expect(isDiscoverableAnime({ format: 'SPECIAL', popularity: 50_000, duration: 24 })).toBe(
            false
        );
        expect(isDiscoverableAnime({ format: 'TV', popularity: 1_999, duration: 24 })).toBe(false);
        expect(isDiscoverableAnime({ format: 'ONA', popularity: 10_000, duration: 14 })).toBe(
            false
        );
    });

    test('fails closed when AniList has not classified format or popularity', () => {
        expect(isDiscoverableAnime({ format: null, popularity: 10_000, duration: 24 })).toBe(false);
        expect(isDiscoverableAnime({ format: 'TV', popularity: null, duration: 24 })).toBe(false);
    });
});
