import { describe, expect, test } from 'bun:test';

import { watchlistOrder, watchlistSort, watchlistSorts, watchlistState } from './watchlist';

describe('watchlist URL selection', () => {
  test('accepts supported state, sort, and order values', () => {
    expect(watchlistState('completed')).toBe('completed');
    expect(watchlistSort('added')).toBe('added');
    expect(watchlistOrder('oldest')).toBe('oldest');
  });

  test('falls back to the default selections', () => {
    expect(watchlistState('paused')).toBe('all');
    expect(watchlistSort('score')).toBe('updated');
    expect(watchlistOrder('ascending')).toBe('newest');
  });

  test('does not offer playback activity as watchlist ordering', () => {
    expect(watchlistSorts).toEqual(['updated', 'added', 'alphabetical']);
    expect(watchlistSort('recent_activity')).toBe('updated');
    expect(watchlistSort('watched')).toBe('updated');
  });
});
