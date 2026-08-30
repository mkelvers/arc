import { currentAnimeSeason } from '@arc/shared/season';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@arc/db';
import { animeFranchiseCache, animeRelease } from '@arc/db/schema';
import { getAnimeRelease } from '../anilist/releases';
import { getBrowseTaxonomy } from '../anilist/browse';
import { refreshHomeHeroCandidates } from '../anilist/hero';
import { refreshHomepage } from '../anilist/home';
import { refreshPopularAnime } from '../browse';
import { refreshFranchiseOrder } from '../franchise';
import { refreshCurrentSimulcast } from '../simulcast';
import { findMapping } from '../tmdb/mapping-store';
import { getArtwork } from '../tmdb/artwork';
import { rediscoverMapping } from './mappings';
import { logger } from '../../logger';

const franchiseRefreshIntervalMs = 7 * 24 * 60 * 60 * 1_000;

async function refreshKnownFranchises(now: Date) {
    const rows = await db
        .select({
            malId: animeRelease.malId,
            fetchedAt: animeFranchiseCache.fetchedAt,
        })
        .from(animeRelease)
        .leftJoin(animeFranchiseCache, eq(animeFranchiseCache.malId, animeRelease.malId))
        .where(isNotNull(animeRelease.malId))
        .groupBy(animeRelease.malId, animeFranchiseCache.fetchedAt);
    const malIds = rows.flatMap(({ malId, fetchedAt }) =>
        malId !== null &&
        (!fetchedAt || now.getTime() - fetchedAt.getTime() >= franchiseRefreshIntervalMs)
            ? [malId]
            : []
    );
    const failures: unknown[] = [];
    let completed = 0;
    for (const malId of malIds) {
        try {
            await refreshFranchiseOrder(malId, { force: true });
            completed += 1;
        } catch (cause) {
            failures.push(cause);
        }
    }
    if (failures.length) {
        throw new AggregateError(failures, 'One or more franchise refreshes failed');
    }

    return { attempted: malIds.length, completed, failed: 0 };
}

async function rediscoverRelatedMappings(release: Awaited<ReturnType<typeof getAnimeRelease>>) {
    const relatedIds = (release.relations?.edges ?? []).flatMap((edge) =>
        edge?.node?.type === 'ANIME' &&
        (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL')
            ? [edge.node.id]
            : []
    );

    for (const relatedId of relatedIds) {
        if (await findMapping(relatedId)) {
            continue;
        }

        try {
            await rediscoverMapping(relatedId);
        } catch (cause) {
            logger.debug(`Related mapping enrichment failed for AniList ${relatedId}`, cause);
        }
    }
}

export async function refreshCatalogSnapshots(now = new Date()) {
    const { season, year } = currentAnimeSeason(now);
    await refreshHomepage(season, year);
    await refreshPopularAnime();
    await refreshCurrentSimulcast(now);
    await getBrowseTaxonomy(true);
    const heroCandidates = await refreshHomeHeroCandidates(now);
    for (const { anilistId } of heroCandidates) {
        try {
            const release = await getAnimeRelease(anilistId);
            await rediscoverRelatedMappings(release);
            if (!(await findMapping(anilistId))) {
                await rediscoverMapping(anilistId);
            }
            await getArtwork(release, { fetchMissing: true });
        } catch (cause) {
            logger.debug(`Hero enrichment failed for AniList ${anilistId}`, cause);
        }
    }
    await refreshKnownFranchises(now);
}
