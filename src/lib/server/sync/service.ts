import {
    SaveSyncMediaListEntryDocument,
    SyncMediaListDocument,
    type MediaListStatus,
} from '$lib/graphql/anilist/generated/graphql';
import { and, desc, eq, lt, lte, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { ensureInternalAnimeId } from '$lib/server/anime/identity';
import {
    accounts,
    animeEpisode,
    animeExternalId,
    animeExternalIdLink,
    playbackProgress,
    syncSettings,
    type WatchlistState,
} from '$lib/server/db/schema';
import { graphql } from '$lib/server/graphql';
import { applyWatchlistEntries, getWatchlistEntries } from '$lib/server/watchlist';
import { anilistRequestPolicy } from '$lib/server/anime/anilist/request-policy';
import { anilistCompletedEpisodes, shouldImportAnilistProgress } from './progress';

const endpoint = 'https://graphql.anilist.co';

function watchlistState(status: MediaListStatus): WatchlistState {
    switch (status) {
        case 'COMPLETED':
            return 'completed';
        case 'CURRENT':
        case 'REPEATING':
            return 'watching';
        case 'DROPPED':
            return 'dropped';
        case 'PAUSED':
        case 'PLANNING':
            return 'plan_to_watch';
    }
}

function anilistStatus(state: WatchlistState): MediaListStatus {
    switch (state) {
        case 'completed':
            return 'COMPLETED';
        case 'watching':
            return 'CURRENT';
        case 'dropped':
            return 'DROPPED';
        case 'plan_to_watch':
            return 'PLANNING';
    }
}

interface SyncOptions {
    importAnilistChanges?: boolean;
    watchingStatus?: boolean;
    episodeProgress?: boolean;
}

export async function syncUser(userId: string, overrides: SyncOptions = {}) {
    const [account, storedSettings] = await Promise.all([
        db.query.accounts.findFirst({
            columns: { accessToken: true, accountId: true },
            where: (entry, { and, eq }) =>
                and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
        }),
        db.query.syncSettings.findFirst({ where: (entry, { eq }) => eq(entry.userId, userId) }),
    ]);

    if (!account?.accessToken) {
        return;
    }

    const settings = {
        automaticSync: storedSettings?.automaticSync ?? false,
        episodeProgress: overrides.episodeProgress ?? storedSettings?.episodeProgress ?? false,
        watchingStatus: overrides.watchingStatus ?? storedSettings?.watchingStatus ?? false,
        importAnilistChanges:
            overrides.importAnilistChanges ?? storedSettings?.importAnilistChanges ?? false,
    };

    const accountId = Number(account.accountId);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        throw new Error('The AniList account could not be identified');
    }

    const response = await anilistRequestPolicy.run(() =>
        graphql(
            endpoint,
            SyncMediaListDocument,
            { userId: accountId },
            {
                headers: { Authorization: `Bearer ${account.accessToken}` },
            }
        )
    );
    const remote =
        response.MediaListCollection?.lists?.flatMap(
            (list) =>
                list?.entries?.flatMap((entry) =>
                    entry?.media?.id && entry.status && entry.updatedAt !== null
                        ? [
                              {
                                  id: entry.id,
                                  anilistId: entry.media.id,
                                  status: entry.status,
                                  progress: entry.progress ?? 0,
                                  updatedAt: entry.updatedAt,
                              },
                          ]
                        : []
                ) ?? []
        ) ?? [];

    const local = await getWatchlistEntries(userId);
    const localProgressRows = settings.episodeProgress
        ? await db
              .select({
                  anilistId: animeExternalId.externalId,
                  episodeNumber: playbackProgress.episodeNumber,
                  completed: playbackProgress.completed,
                  eventAt: playbackProgress.eventAt,
              })
              .from(playbackProgress)
              .innerJoin(
                  animeExternalIdLink,
                  eq(animeExternalIdLink.animeId, playbackProgress.animeId)
              )
              .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
              .where(
                  and(
                      eq(playbackProgress.userId, userId),
                      eq(animeExternalId.provider, 'anilist'),
                      eq(animeExternalId.mediaType, 'anime')
                  )
              )
        : [];
    const progressByAnime = new Map(localProgressRows.map((entry) => [entry.anilistId, entry]));

    if (settings.importAnilistChanges) {
        const localById = new Map(local.map((entry) => [entry.anilistId, entry]));
        await applyWatchlistEntries(
            userId,
            remote.flatMap(({ anilistId, status, updatedAt }) => {
                const current = localById.get(anilistId);
                if (current && current.updatedAt.getTime() >= updatedAt * 1_000) {
                    return [];
                }

                return [
                    {
                        anilistId,
                        state: watchlistState(status),
                        updatedAt: new Date(updatedAt * 1_000),
                    },
                ];
            })
        );
    }

    if (settings.episodeProgress) {
        for (const entry of remote) {
            if (
                entry.progress <= 0 ||
                (entry.status !== 'CURRENT' && entry.status !== 'REPEATING')
            ) {
                continue;
            }

            if (
                !shouldImportAnilistProgress(progressByAnime.get(entry.anilistId), entry.progress)
            ) {
                continue;
            }

            const [episode] = await db
                .select({
                    episodeId: animeEpisode.episodeId,
                    number: animeEpisode.number,
                    runtimeMinutes: animeEpisode.runtimeMinutes,
                })
                .from(animeEpisode)
                .where(
                    and(
                        eq(animeEpisode.anilistId, entry.anilistId),
                        lte(animeEpisode.number, entry.progress)
                    )
                )
                .orderBy(desc(animeEpisode.number))
                .limit(1);
            if (!episode) {
                continue;
            }

            const animeId = await ensureInternalAnimeId(entry.anilistId);
            const durationSeconds = Math.max(60, (episode.runtimeMinutes ?? 24) * 60);
            const eventAt = new Date(entry.updatedAt * 1_000);
            const [saved] = await db
                .insert(playbackProgress)
                .values({
                    userId,
                    animeId,
                    episodeId: episode.episodeId,
                    episodeNumber: episode.number,
                    positionSeconds: durationSeconds,
                    durationSeconds,
                    completed: true,
                    lastWatchedAt: new Date(),
                    eventAt,
                })
                .onConflictDoUpdate({
                    target: [playbackProgress.userId, playbackProgress.animeId],
                    set: {
                        episodeId: episode.episodeId,
                        episodeNumber: episode.number,
                        positionSeconds: durationSeconds,
                        durationSeconds,
                        completed: true,
                        updatedAt: new Date(),
                        lastWatchedAt: new Date(),
                        eventAt,
                    },
                    setWhere: lt(
                        playbackProgress.eventAt,
                        sql.raw(`excluded.${playbackProgress.eventAt.name}`)
                    ),
                })
                .returning({ episodeNumber: playbackProgress.episodeNumber });

            if (saved) {
                progressByAnime.set(entry.anilistId, {
                    anilistId: entry.anilistId,
                    episodeNumber: episode.number,
                    completed: true,
                    eventAt,
                });
            }
        }
    }

    if (settings.watchingStatus || settings.episodeProgress) {
        const remoteById = new Map(remote.map((entry) => [entry.anilistId, entry]));
        for (const entry of local) {
            const current = remoteById.get(entry.anilistId);
            const progress = progressByAnime.get(entry.anilistId);
            const watchlistNeedsSync =
                settings.watchingStatus &&
                (!current || entry.updatedAt.getTime() > current.updatedAt * 1_000);
            const completedEpisodes = progress ? anilistCompletedEpisodes(progress) : null;
            const progressNeedsSync =
                settings.episodeProgress &&
                completedEpisodes !== null &&
                completedEpisodes > (current?.progress ?? 0);

            if (!watchlistNeedsSync && !progressNeedsSync) {
                continue;
            }

            await anilistRequestPolicy.run(() =>
                graphql(
                    endpoint,
                    SaveSyncMediaListEntryDocument,
                    {
                        mediaId: entry.anilistId,
                        ...(watchlistNeedsSync ? { status: anilistStatus(entry.state) } : {}),
                        ...(progressNeedsSync ? { progress: completedEpisodes } : {}),
                    },
                    { headers: { Authorization: `Bearer ${account.accessToken}` } }
                )
            );
        }
    }

    const syncedAt = new Date();
    if (storedSettings) {
        await db
            .update(syncSettings)
            .set({ lastSyncedAt: syncedAt, updatedAt: syncedAt })
            .where(eq(syncSettings.userId, userId));
    }
}

export async function getAutomaticSyncUsers() {
    return db
        .select({ userId: syncSettings.userId })
        .from(syncSettings)
        .innerJoin(
            accounts,
            and(eq(accounts.userId, syncSettings.userId), eq(accounts.providerId, 'anilist'))
        )
        .where(eq(syncSettings.automaticSync, true));
}
