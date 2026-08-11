import { expect, test } from 'bun:test';

import { GraphQLRequestError } from '$lib/server/graphql';
import { AniListRequestPolicy } from './request-policy';

test('one 429 prevents follow-up AniList requests during its retry window', async () => {
    const policy = new AniListRequestPolicy(1);
    let upstreamCalls = 0;
    const rateLimited = new GraphQLRequestError({
        message: 'Too Many Requests.',
        status: 429,
        retryAfterMs: 60_000,
    });

    await expect(
        policy.run(async () => {
            upstreamCalls += 1;
            throw rateLimited;
        })
    ).rejects.toBe(rateLimited);

    await expect(
        policy.run(async () => {
            upstreamCalls += 1;
            return 'should not run';
        })
    ).rejects.toMatchObject({ status: 429 });
    expect(upstreamCalls).toBe(1);
});
