import { describe, expect, test } from 'bun:test';

import { watchlistOrder, watchlistSort, watchlistState } from './watchlist';

describe('watchlist URL selection', () => {
  test('accepts supported state, sort, and order values', () => {
    expect(watchlistState('completed')).toBe('completed');
    expect(watchlistSort('watched')).toBe('watched');
    expect(watchlistOrder('oldest')).toBe('oldest');
  });

  test('falls back to the default selections', () => {
    expect(watchlistState('paused')).toBe('all');
    expect(watchlistSort('score')).toBe('recent_activity');
    expect(watchlistOrder('ascending')).toBe('newest');
  });
});
