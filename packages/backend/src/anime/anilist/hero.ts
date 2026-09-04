import { asc, notInArray, sql } from 'drizzle-orm';

import { HomeHeroCandidatesDocument } from '@arc/shared/graphql/generated/graphql';
import { db } from '@arc/db';
import { homeHeroCandidate } from '@arc/db/schema';
import { request } from './client';
import { eligibleHomeHeroCandidates } from '@arc/core/catalog/home-selection';

export async function refreshHomeHeroCandidates(now = new Date()) {
    const response = await request(
        HomeHeroCandidatesDocument,
        { seasonYear: now.getUTCFullYear() },
        { refreshAfterMs: 6 * 60 * 60 * 1_000, forceRefresh: true }
    );
    const candidates = (response.Page?.media?.filter((value) => value !== null) ?? []).flatMap(
        (media, index) => {
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
                    format: media.format,
                    duration: media.duration,
                    favourites: media.favourites,
                    seasonYear: media.seasonYear,
                    genres: media.genres?.filter((genre) => genre !== null) ?? [],
                    hasPrequel: (
                        media.relations?.edges?.filter((value) => value !== null) ?? []
                    ).some(({ relationType }) => relationType === 'PREQUEL'),
                },
            ];
        }
    );

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

export async function getHomeHeroCandidates(now = new Date()) {
    const stored = await db
        .select({
            anilistId: homeHeroCandidate.anilistId,
            averageScore: homeHeroCandidate.averageScore,
            trendingRank: homeHeroCandidate.trendingRank,
            fetchedAt: homeHeroCandidate.fetchedAt,
        })
        .from(homeHeroCandidate)
        .orderBy(asc(homeHeroCandidate.trendingRank));
    void now;
    return stored.map(({ fetchedAt, ...candidate }) => {
        void fetchedAt;
        return candidate;
    });
}
