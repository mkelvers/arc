import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '$lib/server/db';
import {
  animeDetailsCache,
  animeEpisode,
  animeExternalId,
  animeExternalIdLink,
  notification,
  playbackProgress,
  watchlist,
} from '$lib/server/db/schema';
import { getStoredMedia } from '$lib/server/anime/tmdb/media';
import type { EpisodeAvailabilityTransition } from '$lib/server/anime/episodes/policy';
import type { AniListAnime } from '$lib/server/anime/anilist/types';

export type NotificationInput = {
  userId: string;
  kind: 'episode_available' | 'dub_available' | 'season_available';
  anilistId: number;
  episodeId?: string;
  dedupeKey: string;
  facts: Record<string, unknown>;
};

export async function interestedUserIds(anilistId: number) {
  const rows = await db
    .select({ userId: watchlist.userId })
    .from(watchlist)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
    .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
    .where(
      and(
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime'),
        eq(animeExternalId.externalId, anilistId)
      )
    );
  const progress = await db
    .select({ userId: playbackProgress.userId })
    .from(playbackProgress)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, playbackProgress.animeId))
    .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
    .where(
      and(
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime'),
        eq(animeExternalId.externalId, anilistId)
      )
    );

  return new Set([...rows, ...progress].map(({ userId }) => userId));
}

export async function createNotifications(inputs: readonly NotificationInput[]) {
  if (!inputs.length) {
    return;
  }

  await db
    .insert(notification)
    .values([...inputs])
    .onConflictDoNothing({
      target: [notification.userId, notification.dedupeKey],
    });
}

export async function notifyEpisodeTransitions(
  anilistId: number,
  title: string,
  transitions: readonly EpisodeAvailabilityTransition[],
  userIds: ReadonlySet<string>
) {
  const inputs = transitions.flatMap((transition) =>
    [...userIds].map((userId) => ({
      userId,
      kind: transition.kind,
      anilistId,
      episodeId: transition.episodeId,
      dedupeKey: `${transition.kind}:${anilistId}:${transition.episodeId}`,
      facts: { title, number: transition.number },
    }))
  );

  await createNotifications(inputs);
}

export async function notifyAvailableSeasons(anime: AniListAnime) {
  const users = await interestedUserIds(anime.id);
  if (!users.size) {
    return;
  }

  const sequels = (anime.relations?.edges ?? []).flatMap((edge) =>
    edge?.relationType === 'SEQUEL' && edge.node?.type === 'ANIME'
      ? [
          {
            id: edge.node.id,
            title: edge.node.title?.english ?? edge.node.title?.romaji ?? edge.node.title?.native,
          },
        ]
      : []
  );
  if (!sequels.length) {
    return;
  }

  const available = await db
    .select({ anilistId: animeEpisode.anilistId })
    .from(animeEpisode)
    .where(
      inArray(
        animeEpisode.anilistId,
        sequels.map(({ id }) => id)
      )
    );
  const availableIds = new Set(available.map(({ anilistId }) => anilistId));
  const parentTitle =
    anime.title?.english ?? anime.title?.romaji ?? anime.title?.native ?? `Anime ${anime.id}`;

  await createNotifications(
    sequels
      .filter(({ id }) => availableIds.has(id))
      .flatMap(({ id, title }) =>
        [...users].map((userId) => ({
          userId,
          kind: 'season_available' as const,
          anilistId: id,
          dedupeKey: `season_available:${id}`,
          facts: { title: title ?? `Anime ${id}`, parentTitle },
        }))
      )
  );
}

export async function getUnreadNotificationCount(userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));

  return row?.count ?? 0;
}

export async function markNotificationsRead(userId: string) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

export async function getNotifications(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  const ids = [...new Set(rows.map(({ anilistId }) => anilistId))];

  if (!ids.length) {
    return [];
  }

  const [details, episodes, storedMedia] = await Promise.all([
    db
      .select({ anilistId: animeDetailsCache.anilistId, bannerImage: animeDetailsCache.data })
      .from(animeDetailsCache)
      .where(inArray(animeDetailsCache.anilistId, ids)),
    db
      .select({
        anilistId: animeEpisode.anilistId,
        episodeId: animeEpisode.episodeId,
        imageUrl: animeEpisode.imageUrl,
      })
      .from(animeEpisode)
      .where(inArray(animeEpisode.anilistId, ids)),
    Promise.all(
      ids.map(
        async (anilistId) => [anilistId, await getStoredMedia(anilistId).catch(() => null)] as const
      )
    ),
  ]);
  const detailById = new Map(details.map(({ anilistId, bannerImage }) => [anilistId, bannerImage]));
  const episodeImageById = new Map(
    episodes.map(({ anilistId, episodeId, imageUrl }) => [`${anilistId}:${episodeId}`, imageUrl])
  );
  const backdropById = new Map(
    storedMedia.flatMap(([anilistId, media]) =>
      media?.artwork.selectedBackdrop?.url
        ? [[anilistId, media.artwork.selectedBackdrop.url] as const]
        : []
    )
  );

  return rows.map((row) => {
    const facts = row.facts;
    const title = typeof facts.title === 'string' ? facts.title : `Anime ${row.anilistId}`;
    const number = typeof facts.number === 'number' ? facts.number : null;
    const episode =
      number === null ? '' : `Episode ${Number.isInteger(number) ? number : number.toFixed(1)}`;
    const isSeason = row.kind === 'season_available';
    const body = isSeason
      ? `A new season of ${typeof facts.parentTitle === 'string' ? facts.parentTitle : title} is now available to watch.`
      : row.kind === 'dub_available'
        ? `${episode || 'A new episode'} of ${title} is now available dubbed.`
        : `${episode || 'A new episode'} of ${title} is now available to watch.`;
    const href = row.episodeId
      ? `/anime/${row.anilistId}/watch/${encodeURIComponent(row.episodeId)}`
      : `/anime/${row.anilistId}`;
    const banner = detailById.get(row.anilistId);
    const fallbackBanner =
      banner &&
      typeof banner === 'object' &&
      'bannerImage' in banner &&
      typeof banner.bannerImage === 'string'
        ? banner.bannerImage
        : null;
    const episodeImage = row.episodeId
      ? (episodeImageById.get(`${row.anilistId}:${row.episodeId}`) ?? null)
      : null;

    return {
      id: row.id,
      title,
      body,
      href,
      image: backdropById.get(row.anilistId) ?? fallbackBanner ?? episodeImage,
      actionLabel: isSeason ? 'View season' : 'Watch now',
      createdAt: row.createdAt.getTime(),
    };
  });
}
