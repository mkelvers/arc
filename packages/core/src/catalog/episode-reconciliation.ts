import { and, eq } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisode, animeEpisodeSync } from '@arc/shared/db/schema';
import { episodeMetadataRevisionAfterSync } from './episode-policy';
import { reconcileEpisodeMetadata, type EpisodeMetadata } from './episode-metadata';

export { reconcileEpisodeMetadata } from './episode-metadata';
export type { EpisodeMetadata, EpisodeMetadataRow } from './episode-metadata';

export async function synchronizeEpisodeMetadata(
    anilistId: number,
    metadataSourceId: number | null,
    metadata: ReadonlyMap<string, EpisodeMetadata> | null,
    confirmedAirDates: ReadonlyMap<number, Date> = new Map(),
    synchronizedAt = new Date()
) {
    return db.transaction(async (tx) => {
        const [episodes, sync] = await Promise.all([
            tx
                .select({
                    episodeId: animeEpisode.episodeId,
                    number: animeEpisode.number,
                    metadataTitle: animeEpisode.metadataTitle,
                    metadataTitleSource: animeEpisode.metadataTitleSource,
                    imageUrl: animeEpisode.imageUrl,
                    runtimeMinutes: animeEpisode.runtimeMinutes,
                    airDate: animeEpisode.airDate,
                    overview: animeEpisode.overview,
                    overviewSource: animeEpisode.overviewSource,
                })
                .from(animeEpisode)
                .where(eq(animeEpisode.anilistId, anilistId)),
            tx
                .select({
                    metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                    metadataRevision: animeEpisodeSync.metadataRevision,
                })
                .from(animeEpisodeSync)
                .where(eq(animeEpisodeSync.anilistId, anilistId))
                .limit(1)
                .then((rows) => rows[0] ?? null),
        ]);
        const currentSourceId = metadataSourceId ?? sync?.metadataExternalIdId ?? null;
        const values = reconcileEpisodeMetadata(episodes, metadata, {
            previousSourceId: sync?.metadataExternalIdId ?? null,
            currentSourceId,
            previousRevision: sync?.metadataRevision ?? null,
            confirmedAirDates,
        });

        for (const value of values) {
            await tx
                .update(animeEpisode)
                .set({
                    metadataTitle: value.metadataTitle,
                    metadataTitleSource: value.metadataTitleSource,
                    imageUrl: value.imageUrl,
                    runtimeMinutes: value.runtimeMinutes,
                    airDate: value.airDate,
                    overview: value.overview,
                    overviewSource: value.overviewSource,
                })
                .where(
                    and(
                        eq(animeEpisode.anilistId, anilistId),
                        eq(animeEpisode.episodeId, value.episodeId)
                    )
                );
        }

        const metadataRevision = episodeMetadataRevisionAfterSync(
            values.map(({ imageUrl, metadataTitle, overview }) => ({
                image: imageUrl,
                title: metadataTitle ?? '',
                overview: overview ?? '',
            })),
            metadata !== null,
            currentSourceId !== null
        );
        await tx
            .insert(animeEpisodeSync)
            .values({
                anilistId,
                metadataExternalIdId: currentSourceId,
                metadataRevision,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    metadataExternalIdId: currentSourceId,
                    metadataRevision,
                },
            });

        return {
            episodes: values,
            metadataRevision,
            synchronizedAt,
        };
    });
}
