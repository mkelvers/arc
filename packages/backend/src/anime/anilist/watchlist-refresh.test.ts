import { expect, test } from 'bun:test';

import { watchlistCardFreshForMs } from './watchlist-refresh';

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

test('refreshes watchlist cards according to release mutability', () => {
    expect(watchlistCardFreshForMs({ format: 'TV', status: 'RELEASING' })).toBe(6 * HOUR);
    expect(watchlistCardFreshForMs({ format: 'TV', status: 'NOT_YET_RELEASED' })).toBe(DAY);
    expect(watchlistCardFreshForMs({ format: 'TV', status: 'HIATUS' })).toBe(7 * DAY);
    expect(watchlistCardFreshForMs({ format: 'TV', status: 'FINISHED' })).toBe(90 * DAY);
    expect(watchlistCardFreshForMs({ format: 'MOVIE', status: 'CANCELLED' })).toBe(90 * DAY);
    expect(watchlistCardFreshForMs({ format: null, status: 'FINISHED' })).toBe(DAY);
    expect(watchlistCardFreshForMs({ format: 'TV', status: null })).toBe(DAY);
});
