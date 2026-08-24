import { describe, expect, test } from 'bun:test';

import { interestWatchlistStates } from './interest-policy';

describe('release interest sources', () => {
    test('counts every current watchlist state except dropped', () => {
        expect(interestWatchlistStates).toEqual(['watching', 'plan_to_watch', 'completed']);
        expect(interestWatchlistStates).not.toContain('dropped');
    });
});
