import { describe, expect, test } from 'bun:test';

import { parseAniSkipResponse, validSkipInterval } from './aniskip';

describe('parseAniSkipResponse', () => {
    test('maps validated opening and ending results', () => {
        expect(
            parseAniSkipResponse({
                found: true,
                results: [
                    {
                        skipType: 'op',
                        interval: { startTime: 3.221, endTime: 93.221 },
                    },
                    {
                        skipType: 'ed',
                        interval: {
                            startTime: 1_417.135,
                            endTime: 1_507.135,
                        },
                    },
                ],
            }),
        ).toEqual({
            opening: { start: 3.221, end: 93.221 },
            ending: { start: 1_417.135, end: 1_507.135 },
            source: 'aniskip',
        });
    });

    test('stores a valid not-found response as empty AniSkip data', () => {
        expect(parseAniSkipResponse({ found: false, results: [] })).toEqual({
            opening: null,
            ending: null,
            source: 'aniskip',
        });
    });

    test('ignores malformed intervals and rejects malformed envelopes', () => {
        expect(
            parseAniSkipResponse({
                found: true,
                results: [
                    {
                        skipType: 'op',
                        interval: { startTime: 90, endTime: 30 },
                    },
                ],
            }),
        ).toEqual({ opening: null, ending: null, source: 'aniskip' });
        expect(parseAniSkipResponse({ found: true, results: null })).toBeNull();
    });
});

describe('validSkipInterval', () => {
    test('accepts bounded finite intervals', () => {
        expect(validSkipInterval({ start: 0, end: 90.5 })).toEqual({
            start: 0,
            end: 90.5,
        });
    });

    test('rejects inverted, negative, and excessive intervals', () => {
        expect(validSkipInterval({ start: 10, end: 10 })).toBeNull();
        expect(validSkipInterval({ start: -1, end: 10 })).toBeNull();
        expect(validSkipInterval({ start: 0, end: 700_000 })).toBeNull();
    });
});
