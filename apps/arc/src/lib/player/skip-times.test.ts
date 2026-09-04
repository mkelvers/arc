import { describe, expect, test } from 'bun:test';

import {
    activeSkip,
    intervalFromTemplate,
    SegmentSaveResultSchema,
    skipTimesDraft,
    type EpisodeSkipTimes,
} from '@arc/core/browser';

const times: EpisodeSkipTimes = {
    opening: {
        start: 5,
        end: 95,
    },
    ending: {
        start: 1_320,
        end: 1_410,
    },
    source: 'aniskip',
};

describe('activeSkip', () => {
    test('returns the active opening and ending intervals', () => {
        expect(activeSkip(times, 5)).toEqual({
            kind: 'opening',
            interval: {
                start: 5,
                end: 95,
            },
        });
        expect(activeSkip(times, 1_350)).toEqual({
            kind: 'ending',
            interval: {
                start: 1_320,
                end: 1_410,
            },
        });
    });

    test('uses an exclusive end boundary', () => {
        expect(activeSkip(times, 95)).toBeNull();
        expect(activeSkip(times, 1_410)).toBeNull();
    });
});

test('skipTimesDraft preserves absent endpoints for manual editing', () => {
    expect(skipTimesDraft({ opening: null, ending: null, source: null })).toEqual({
        opening: {
            start: null,
            end: null,
        },
        ending: {
            start: null,
            end: null,
        },
    });
});

describe('intervalFromTemplate', () => {
    test('applies a confirmed duration to a new start', () => {
        expect(intervalFromTemplate(108.7, 89.8)).toEqual({ start: 108.7, end: 198.5 });
    });

    test('rejects invalid starts and durations', () => {
        expect(intervalFromTemplate(-1, 90)).toBeNull();
        expect(intervalFromTemplate(10, 0)).toBeNull();
        expect(intervalFromTemplate(10, Number.POSITIVE_INFINITY)).toBeNull();
    });
});

describe('SegmentSaveResultSchema', () => {
    test('validates saved segments and their active templates', () => {
        const result = {
            times: {
                opening: {
                    start: 108.7,
                    end: 198.5,
                },
                ending: null,
                source: 'manual',
            },
            templates: {
                opening: {
                    fromEpisode: 26,
                    duration: 89.8,
                },
                ending: null,
            },
        } as const;

        expect(SegmentSaveResultSchema.parse(result)).toEqual(result);
    });

    test('rejects malformed save responses', () => {
        expect(
            SegmentSaveResultSchema.safeParse({
                times: {},
                templates: {},
            }).success
        ).toBeFalse();
        expect(
            SegmentSaveResultSchema.safeParse({
                times: {
                    opening: null,
                    ending: null,
                    source: 'manual',
                },
                templates: {
                    opening: {
                        fromEpisode: 0,
                        duration: 90,
                    },
                    ending: null,
                },
            }).success
        ).toBeFalse();
    });
});
