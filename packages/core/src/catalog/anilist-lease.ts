import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@arc/shared/db';
import { anilistRequestState } from '@arc/shared/db/schema';
import { GraphQLRequestError } from '@arc/core/graphql/error';

export async function coordinatedAniListRequest<Value>(
    operation: string,
    load: () => Promise<Value>
) {
    const owner = randomUUID();
    await db.insert(anilistRequestState).values({ name: 'global' }).onConflictDoNothing();

    for (;;) {
        const now = new Date();
        const [claimed] = await db
            .update(anilistRequestState)
            .set({
                leaseOwner: owner,
                leaseUntil: new Date(now.getTime() + 30_000),
                lastRequestAt: now,
                lastOperation: operation,
                requestCount: sql`${anilistRequestState.requestCount} + 1`,
            })
            .where(
                and(
                    eq(anilistRequestState.name, 'global'),
                    lte(anilistRequestState.nextRequestAt, now),
                    or(
                        isNull(anilistRequestState.blockedUntil),
                        lte(anilistRequestState.blockedUntil, now)
                    ),
                    or(
                        isNull(anilistRequestState.leaseUntil),
                        lte(anilistRequestState.leaseUntil, now)
                    )
                )
            )
            .returning({ name: anilistRequestState.name });

        if (claimed) {
            break;
        }

        const [state] = await db
            .select({
                blockedUntil: anilistRequestState.blockedUntil,
                leaseUntil: anilistRequestState.leaseUntil,
                nextRequestAt: anilistRequestState.nextRequestAt,
            })
            .from(anilistRequestState)
            .where(eq(anilistRequestState.name, 'global'))
            .limit(1);
        const blockedFor = (state?.blockedUntil?.getTime() ?? 0) - Date.now();
        if (blockedFor > 0) {
            throw new GraphQLRequestError({
                message: 'AniList requests are temporarily paused after an upstream failure',
                status: 429,
                retryAfterMs: blockedFor,
            });
        }

        const retryAt = Math.min(
            state?.leaseUntil?.getTime() ?? Number.POSITIVE_INFINITY,
            state?.nextRequestAt.getTime() ?? Number.POSITIVE_INFINITY
        );
        await new Promise((resolve) =>
            setTimeout(resolve, Math.max(25, Math.min(1_000, retryAt - Date.now())))
        );
    }

    try {
        const value = await load();
        const now = new Date();
        await db
            .update(anilistRequestState)
            .set({
                nextRequestAt: new Date(now.getTime() + 2_100),
                blockedUntil: null,
                leaseOwner: null,
                leaseUntil: null,
                lastStatus: 200,
                lastError: null,
                successCount: sql`${anilistRequestState.successCount} + 1`,
            })
            .where(
                and(
                    eq(anilistRequestState.name, 'global'),
                    eq(anilistRequestState.leaseOwner, owner)
                )
            );
        return value;
    } catch (cause) {
        const now = new Date();
        const delay =
            cause instanceof GraphQLRequestError
                ? cause.status === 429
                    ? (cause.retryAfterMs ?? 60_000)
                    : cause.status == null || cause.status >= 500
                      ? 30_000
                      : 0
                : 0;
        await db
            .update(anilistRequestState)
            .set({
                nextRequestAt: new Date(now.getTime() + 2_100),
                blockedUntil:
                    delay > 0
                        ? sql`greatest(coalesce(${anilistRequestState.blockedUntil}, now()), now() + (${delay} * interval '1 millisecond'))`
                        : null,
                leaseOwner: null,
                leaseUntil: null,
                lastStatus: cause instanceof GraphQLRequestError ? (cause.status ?? null) : null,
                lastError: cause instanceof Error ? cause.message : 'AniList request failed',
                failureCount: sql`${anilistRequestState.failureCount} + 1`,
            })
            .where(
                and(
                    eq(anilistRequestState.name, 'global'),
                    eq(anilistRequestState.leaseOwner, owner)
                )
            );
        throw cause;
    }
}
