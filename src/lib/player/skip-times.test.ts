import { describe, expect, test } from 'bun:test';

import {
    activeSkip,
    emptySkipTimes,
    skipTimesDraft,
    type EpisodeSkipTimes,
} from './skip-times';

const times: EpisodeSkipTimes = {
    opening: { start: 5, end: 95 },
    ending: { start: 1_320, end: 1_410 },
    source: 'aniskip',
};

describe('activeSkip', () => {
    test('returns the active opening and ending intervals', () => {
        expect(activeSkip(times, 5)).toEqual({
            kind: 'opening',
            interval: { start: 5, end: 95 },
        });
        expect(activeSkip(times, 1_350)).toEqual({
            kind: 'ending',
            interval: { start: 1_320, end: 1_410 },
        });
    });

    test('uses an exclusive end boundary', () => {
        expect(activeSkip(times, 95)).toBeNull();
        expect(activeSkip(times, 1_410)).toBeNull();
    });
});

test('skipTimesDraft preserves absent endpoints for manual editing', () => {
    expect(skipTimesDraft(emptySkipTimes())).toEqual({
        opening: { start: null, end: null },
        ending: { start: null, end: null },
    });
});
