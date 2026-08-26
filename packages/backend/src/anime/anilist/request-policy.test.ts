import { describe, expect, test } from 'bun:test';

import { GraphQLRequestError } from '#graphql';
import { anilistRetryDelay } from './request-policy';

describe('AniList retry policy', () => {
    test('preserves AniList Retry-After for rate limits', () => {
        expect(
            anilistRetryDelay(
                new GraphQLRequestError({
                    message: 'Too Many Requests.',
                    status: 429,
                    retryAfterMs: 21_000,
                })
            )
        ).toBe(21_000);
    });

    test('backs off outages but not ordinary client errors', () => {
        expect(anilistRetryDelay(new GraphQLRequestError({ message: 'Unavailable' }))).toBe(30_000);
        expect(
            anilistRetryDelay(new GraphQLRequestError({ message: 'Bad request', status: 400 }))
        ).toBe(0);
    });
});
