import { asc, notInArray, sql } from 'drizzle-orm';

import { HomeHeroCandidatesDocument } from '@arc/shared/anilist/generated/graphql';
import { db } from '@arc/db';
import { homeHeroCandidate } from '@arc/db/schema';
import { request } from './client';
import { present } from './text';
import { eligibleHomeHeroCandidates } from '../home/selection';

async function refreshCandidates(now: Date, forceRefresh = false) {
    const response = await request(
        HomeHeroCandidatesDocument,
        { seasonYear: now.getUTCFullYear() },
        { refreshAfterMs: 6 * 60 * 60 * 1_000, forceRefresh }
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
                format: media.format,
                duration: media.duration,
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

export function refreshHomeHeroCandidates(now = new Date()) {
    return refreshCandidates(now, true);
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
