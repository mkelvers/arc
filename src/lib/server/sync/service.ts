import {
    DeleteSyncMediaListEntryDocument,
    SaveSyncMediaListEntryDocument,
    SyncMediaListDocument,
    type MediaListStatus,
} from '$lib/graphql/anilist/generated/graphql';
import { and, eq, isNull } from 'drizzle-orm';

import { anilistRequestPolicy } from '$lib/server/anime/anilist/request-policy';
import { db } from '$lib/server/db';
import {
    accounts,
    animeExternalId,
    animeExternalIdLink,
    playbackProgress,
    type WatchlistState,
} from '$lib/server/db/schema';
import { GraphQLRequestError, graphql } from '$lib/server/graphql';
import { getWatchlistEntries } from '$lib/server/watchlist';
import { anilistCompletedEpisodes } from './progress';

const endpoint = 'https://graphql.anilist.co';

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

export async function publishAniList(userId: string) {
    const account = await db.query.accounts.findFirst({
        columns: { accessToken: true, accountId: true },
        where: (entry, { and, eq }) =>
            and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
    });
    if (!account?.accessToken) {
        return;
    }

    const accountId = Number(account.accountId);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        throw new Error('The AniList account could not be identified');
    }

    const [response, watchlistEntries, progressRows] = await Promise.all([
        anilistRequestPolicy.run(() =>
            graphql(
                endpoint,
                SyncMediaListDocument,
                { userId: accountId },
                { headers: { Authorization: `Bearer ${account.accessToken}` } }
            )
        ),
        getWatchlistEntries(userId),
        db
            .select({
                anilistId: animeExternalId.externalId,
                episodeNumber: playbackProgress.episodeNumber,
                completed: playbackProgress.completed,
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
                    isNull(playbackProgress.dismissedAt),
                    eq(animeExternalId.provider, 'anilist'),
                    eq(animeExternalId.mediaType, 'anime')
                )
            ),
    ]);
    const remoteEntries =
        response.MediaListCollection?.lists?.flatMap(
            (list) =>
                list?.entries?.flatMap((entry) =>
                    entry?.media?.id && entry.status
                        ? [
                              {
                                  id: entry.id,
                                  anilistId: entry.media.id,
                                  status: entry.status,
                                  progress: entry.progress ?? 0,
                              },
                          ]
                        : []
                ) ?? []
        ) ?? [];
    const remoteByAnime = new Map(remoteEntries.map((entry) => [entry.anilistId, entry] as const));
    const progressByAnime = new Map(progressRows.map((entry) => [entry.anilistId, entry]));
    const localAnimeIds = new Set(watchlistEntries.map((entry) => entry.anilistId));

    for (const entry of watchlistEntries) {
        const remote = remoteByAnime.get(entry.anilistId);
        const status = anilistStatus(entry.state);
        const progress = progressByAnime.get(entry.anilistId);
        const completedEpisodes = progress ? anilistCompletedEpisodes(progress) : undefined;

        if (
            remote?.status === status &&
            (completedEpisodes === undefined || remote.progress === completedEpisodes)
        ) {
            continue;
        }

        await anilistRequestPolicy.run(() =>
            graphql(
                endpoint,
                SaveSyncMediaListEntryDocument,
                {
                    mediaId: entry.anilistId,
                    status,
                    ...(completedEpisodes === undefined ? {} : { progress: completedEpisodes }),
                },
                { headers: { Authorization: `Bearer ${account.accessToken}` } }
            )
        );
    }

    for (const entry of remoteEntries) {
        if (localAnimeIds.has(entry.anilistId)) {
            continue;
        }

        try {
            await anilistRequestPolicy.run(() =>
                graphql(
                    endpoint,
                    DeleteSyncMediaListEntryDocument,
                    { id: entry.id },
                    { headers: { Authorization: `Bearer ${account.accessToken}` } }
                )
            );
        } catch (cause) {
            if (cause instanceof GraphQLRequestError && cause.status === 404) {
                continue;
            }

            throw cause;
        }
    }
}

export async function getAniListUsers() {
    return db
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(eq(accounts.providerId, 'anilist'));
}
