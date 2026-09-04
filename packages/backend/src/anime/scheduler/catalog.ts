import { createCatalogApplication } from '@arc/core';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@arc/shared/db';
import { animeFranchise, animeRelease } from '@arc/shared/db/schema';
import { getAnimeRelease } from '../anilist/releases';
import { refreshHomeHeroCandidates } from '../anilist/hero';
import { refreshFranchiseOrder } from '../franchise';
import { ensureEpisodeInventoryBackfill } from '../episodes/sync';
import { findMapping } from '../tmdb/mapping-store';
import { getArtwork } from '../tmdb/artwork';
import { rediscoverMapping } from './mappings';
import { logger } from '../../logger';
import { createCatalogSource } from '../catalog-source';

const catalog = createCatalogApplication(createCatalogSource());

const franchiseRefreshIntervalMs = 7 * 24 * 60 * 60 * 1_000;

async function refreshKnownFranchises(now: Date) {
    const rows = await db
        .select({
            malId: animeRelease.malId,
            fetchedAt: animeFranchise.fetchedAt,
        })
        .from(animeRelease)
        .leftJoin(animeFranchise, eq(animeFranchise.malId, animeRelease.malId))
        .where(isNotNull(animeRelease.malId))
        .groupBy(animeRelease.malId, animeFranchise.fetchedAt);
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
            await getAnimeRelease(relatedId);
            await rediscoverMapping(relatedId);
        } catch (cause) {
            logger.debug(`Related mapping enrichment failed for AniList ${relatedId}`, cause);
        }
    }
}

export async function refreshCatalogSnapshots(now = new Date()) {
    await catalog.refreshCatalogSnapshots(now);
    const heroCandidates = await refreshHomeHeroCandidates(now);
    for (const { anilistId } of heroCandidates) {
        try {
            const release = await getAnimeRelease(anilistId);
            await ensureEpisodeInventoryBackfill(anilistId);
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

export const refreshReleaseCalendar = catalog.refreshReleaseCalendar;
