import { asc, notInArray, sql } from 'drizzle-orm';

import { HomeHeroCandidatesDocument } from '@arc/shared/anilist/generated/graphql';
import { db } from '@arc/db';
import { homeHeroCandidate } from '@arc/db/schema';
import { request } from './client';
import { present } from './text';
import { eligibleHomeHeroCandidates, type HomeHeroCandidate } from '../home/selection';

let refreshRequest: Promise<HomeHeroCandidate[]> | null = null;

async function storedCandidates() {
    return db
        .select({
            anilistId: homeHeroCandidate.anilistId,
            averageScore: homeHeroCandidate.averageScore,
            trendingRank: homeHeroCandidate.trendingRank,
            fetchedAt: homeHeroCandidate.fetchedAt,
        })
        .from(homeHeroCandidate)
        .orderBy(asc(homeHeroCandidate.trendingRank));
}

async function refreshCandidates(now: Date) {
    const response = await request(
        HomeHeroCandidatesDocument,
        { seasonYear: now.getUTCFullYear() },
        { cacheForMs: 6 * 60 * 60 * 1_000 }
    );
    const candidates = present(response.Page?.media).flatMap((media, index) => {
        if (
            media.averageScore === null ||
            media.popularity === null ||
            media.favourites === null ||
            media.seasonYear === null
        ) {
            return [];
        }

        return [
            {
                anilistId: media.id,
                averageScore: media.averageScore,
                trendingRank: index + 1,
                popularity: media.popularity,
                favourites: media.favourites,
                seasonYear: media.seasonYear,
                genres: present(media.genres),
                hasPrequel: present(media.relations?.edges).some(
                    ({ relationType }) => relationType === 'PREQUEL'
                ),
            },
        ];
    });

    const eligible = eligibleHomeHeroCandidates(candidates, now);
    if (!eligible.length) {
        throw new Error('AniList returned no eligible current-year hero candidates');
    }

    const fetchedAt = new Date();
    await db.transaction(async (tx) => {
        await tx
            .insert(homeHeroCandidate)
            .values(
                eligible.map(({ anilistId, averageScore, trendingRank }) => ({
                    anilistId,
                    averageScore,
                    trendingRank,
                    fetchedAt,
                }))
            )
            .onConflictDoUpdate({
                target: homeHeroCandidate.anilistId,
                set: {
                    averageScore: sql`excluded.average_score`,
                    trendingRank: sql`excluded.trending_rank`,
                    fetchedAt,
                },
            });
        await tx.delete(homeHeroCandidate).where(
            notInArray(
                homeHeroCandidate.anilistId,
                eligible.map(({ anilistId }) => anilistId)
            )
        );
    });

    return eligible.map(({ anilistId, averageScore, trendingRank }) => ({
        anilistId,
        averageScore,
        trendingRank,
    }));
}

function refresh(now: Date) {
    if (!refreshRequest) {
        refreshRequest = refreshCandidates(now).finally(() => {
            refreshRequest = null;
        });
    }

    return refreshRequest;
}

export async function getHomeHeroCandidates(now = new Date()) {
    const stored = await storedCandidates();
    const newest = stored[0]?.fetchedAt;
    if (
        newest &&
        newest.getUTCFullYear() === now.getUTCFullYear() &&
        now.getTime() - newest.getTime() < 24 * 60 * 60 * 1_000
    ) {
        return stored.map(({ fetchedAt, ...candidate }) => {
            void fetchedAt;
            return candidate;
        });
    }

    try {
        return await refresh(now);
    } catch (cause) {
        if (stored.length) {
            console.warn('AniList hero candidate refresh failed; using stored candidates', cause);
            return stored.map(({ fetchedAt, ...candidate }) => {
                void fetchedAt;
                return candidate;
            });
        }

        throw cause;
    }
}
