import { and, eq } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisode, animeEpisodeSync } from '@arc/shared/db/schema';
import { canPreserveEpisodeMetadata } from './episode-policy';
import { preferredEpisodeAirDate } from './episode-release';

export interface EpisodeMetadata {
    title: string | null;
    titleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtime: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export interface EpisodeMetadataRow {
    episodeId: string;
    number: number;
    metadataTitle: string | null;
    metadataTitleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtimeMinutes: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export function reconcileEpisodeMetadata(
    episodes: readonly EpisodeMetadataRow[],
    metadata: ReadonlyMap<string, EpisodeMetadata> | null,
    options: {
        previousSourceId: number | null;
        currentSourceId: number | null;
        confirmedAirDates?: ReadonlyMap<number, Date>;
    }
) {
    const preserve = canPreserveEpisodeMetadata(options.previousSourceId, options.currentSourceId);

    return episodes.map((episode) => {
        const current = metadata?.get(episode.episodeId);
        const previous = preserve ? episode : null;
        const airDate = current?.airDate || previous?.airDate || null;

        return {
            episodeId: episode.episodeId,
            metadataTitle: current?.title ?? previous?.metadataTitle ?? null,
            metadataTitleSource: current?.titleSource ?? previous?.metadataTitleSource ?? null,
            imageUrl: current?.imageUrl ?? previous?.imageUrl ?? null,
            runtimeMinutes: current?.runtime ?? previous?.runtimeMinutes ?? null,
            airDate: preferredEpisodeAirDate(
                episode.number,
                airDate,
                options.confirmedAirDates?.get(episode.number)
            ),
            overview: current?.overview ?? previous?.overview ?? null,
            overviewSource: current?.overviewSource ?? previous?.overviewSource ?? null,
        };
    });
}

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

        await tx
            .insert(animeEpisodeSync)
            .values({
                anilistId,
                metadataExternalIdId: currentSourceId,
            })
            .onConflictDoUpdate({
                target: animeEpisodeSync.anilistId,
                set: {
                    metadataExternalIdId: currentSourceId,
                },
            });

        return {
            episodes: values,
            synchronizedAt,
        };
    });
}
