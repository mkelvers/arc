import { GraphQLRequestError } from '@arc/shared/graphql-error';

export function anilistRetryDelay(cause: unknown) {
    if (!(cause instanceof GraphQLRequestError)) {
        return 0;
    }

    return cause.status === 429
        ? (cause.retryAfterMs ?? 60_000)
        : cause.status == null || cause.status >= 500
          ? 30_000
          : 0;
}
