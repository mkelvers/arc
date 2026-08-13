import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { anilistPublication } from '$lib/server/db/schema';
import { GraphQLRequestError } from '$lib/server/graphql';
import { publicationRetryDelay } from './publication-policy';
import { getAniListUsers, publishAniList } from './service';

export async function requestAllAniListPublications() {
    const users = await getAniListUsers();
    if (!users.length) {
        return 0;
    }

    const now = new Date();
    await db
        .insert(anilistPublication)
        .values(users.map(({ userId }) => ({ userId, nextAttemptAt: now })))
        .onConflictDoUpdate({
            target: anilistPublication.userId,
            set: {
                version: sql`${anilistPublication.version} + 1`,
                nextAttemptAt: now,
                attempts: 0,
                lastError: null,
            },
        });

    return users.length;
}

async function claimPublications(limit: number) {
    const now = new Date();
    const candidates = await db
        .select({
            userId: anilistPublication.userId,
            version: anilistPublication.version,
            attempts: anilistPublication.attempts,
        })
        .from(anilistPublication)
        .where(
            and(
                lte(anilistPublication.nextAttemptAt, now),
                or(isNull(anilistPublication.leaseUntil), lte(anilistPublication.leaseUntil, now))
            )
        )
        .orderBy(asc(anilistPublication.nextAttemptAt))
        .limit(limit * 2);
    const claimed: typeof candidates = [];

    for (const candidate of candidates) {
        const [row] = await db
            .update(anilistPublication)
            .set({ leaseUntil: new Date(now.getTime() + 2 * 60 * 1_000) })
            .where(
                and(
                    eq(anilistPublication.userId, candidate.userId),
                    eq(anilistPublication.version, candidate.version),
                    or(
                        isNull(anilistPublication.leaseUntil),
                        lte(anilistPublication.leaseUntil, now)
                    )
                )
            )
            .returning({ userId: anilistPublication.userId });

        if (row) {
            claimed.push(candidate);
        }
        if (claimed.length === limit) {
            break;
        }
    }

    return claimed;
}

async function releaseChangedPublication(userId: string) {
    await db
        .update(anilistPublication)
        .set({ leaseUntil: null, nextAttemptAt: new Date() })
        .where(eq(anilistPublication.userId, userId));
}

export async function publishPendingAniList(limit = 5) {
    const publications = await claimPublications(limit);
    let published = 0;

    for (const publication of publications) {
        try {
            await publishAniList(publication.userId);
            const [removed] = await db
                .delete(anilistPublication)
                .where(
                    and(
                        eq(anilistPublication.userId, publication.userId),
                        eq(anilistPublication.version, publication.version)
                    )
                )
                .returning({ userId: anilistPublication.userId });

            if (!removed) {
                await releaseChangedPublication(publication.userId);
            }
            published += 1;
        } catch (cause) {
            const retryAfterMs =
                cause instanceof GraphQLRequestError ? cause.retryAfterMs : undefined;
            const [updated] = await db
                .update(anilistPublication)
                .set({
                    attempts: publication.attempts + 1,
                    nextAttemptAt: new Date(
                        Date.now() + publicationRetryDelay(publication.attempts, retryAfterMs)
                    ),
                    leaseUntil: null,
                    lastError:
                        cause instanceof Error ? cause.message : 'AniList publication failed',
                })
                .where(
                    and(
                        eq(anilistPublication.userId, publication.userId),
                        eq(anilistPublication.version, publication.version)
                    )
                )
                .returning({ userId: anilistPublication.userId });

            if (!updated) {
                await releaseChangedPublication(publication.userId);
            }
        }
    }

    return { claimed: publications.length, published };
}
