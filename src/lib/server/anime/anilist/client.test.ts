import { describe, expect, test } from 'bun:test';

import { GraphQLRequestError } from '$lib/server/graphql';
import { transientRequestError } from './client';

describe('AniList transient request classification', () => {
  test.each([
    [undefined, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [404, false],
  ] as const)('classifies status %p as retryable=%p', (status, expected) => {
    expect(transientRequestError(new GraphQLRequestError({ message: 'request', status }))).toBe(
      expected
    );
  });
});
