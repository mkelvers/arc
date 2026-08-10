import { and, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm';

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
import type { EpisodeAvailabilityTransition } from '$lib/server/anime/episodes/policy';
import type { AniListAnime } from '$lib/server/anime/anilist/types';
import { getStoredBackdrops } from '$lib/server/anime/tmdb/media';

const recentSeasonWindow = 180 * 24 * 60 * 60 * 1_000;

function recentSeason(data: AniListAnime) {
  if (data.format === 'MOVIE') {
    return false;
  }

  if (data.status === 'RELEASING') {
    return true;
  }

  const { year, month, day } = data.startDate ?? {};
  if (!year || !month || !day) {
    return false;
  }

  const startedAt = Date.UTC(year, month - 1, day);
  return startedAt <= Date.now() && Date.now() - startedAt <= recentSeasonWindow;
}

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

export async function episodeInterestedUserIds(anilistId: number) {
  const rows = await db
    .select({ userId: watchlist.userId })
    .from(watchlist)
    .innerJoin(animeExternalIdLink, eq(animeExternalIdLink.animeId, watchlist.animeId))
    .innerJoin(animeExternalId, eq(animeExternalId.id, animeExternalIdLink.externalIdId))
    .where(
      and(
        eq(animeExternalId.provider, 'anilist'),
        eq(animeExternalId.mediaType, 'anime'),
        eq(animeExternalId.externalId, anilistId),
        inArray(watchlist.state, ['watching', 'plan_to_watch'])
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
      facts: { title, number: transition.number, eventDate: transition.airDate },
    }))
  );

  await createNotifications(inputs);
}

export async function notifyRecentEpisodeCatchup(
  anilistId: number,
  title: string,
  userIds: ReadonlySet<string>,
  since: Date
) {
  const [latest] = await db
    .select({
      episodeId: animeEpisode.episodeId,
      number: animeEpisode.number,
      airDate: animeEpisode.airDate,
    })
    .from(animeEpisode)
    .where(and(eq(animeEpisode.anilistId, anilistId), gte(animeEpisode.firstSeenAt, since)))
    .orderBy(desc(animeEpisode.number))
    .limit(50);

  const canonical = latest && Number.isInteger(latest.number) && latest.number > 0 ? latest : null;

  if (!canonical) {
    return;
  }

  const seasonUsers = await db
    .select({ userId: notification.userId })
    .from(notification)
    .where(
      and(
        eq(notification.anilistId, anilistId),
        eq(notification.kind, 'season_available'),
        inArray(notification.userId, [...userIds])
      )
    );
  const seasonUserIds = new Set(seasonUsers.map(({ userId }) => userId));

  await createNotifications(
    [...userIds]
      .filter((userId) => !seasonUserIds.has(userId))
      .map((userId) => ({
        userId,
        kind: 'episode_available' as const,
        anilistId,
        episodeId: canonical.episodeId,
        dedupeKey: `episode_available:${anilistId}:${canonical.episodeId}`,
        facts: { title, number: canonical.number, eventDate: canonical.airDate, catchup: true },
      }))
  );
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

  const sequelDetails = await db
    .select({ anilistId: animeDetailsCache.anilistId, data: animeDetailsCache.data })
    .from(animeDetailsCache)
    .where(
      inArray(
        animeDetailsCache.anilistId,
        sequels.map(({ id }) => id)
      )
    );
  const now = Date.now();
  const eligibleIds = new Set(
    sequelDetails
      .filter(({ data }) => {
        if (data.status === 'RELEASING') {
          return true;
        }

        const { year, month, day } = data.startDate ?? {};
        if (!year || !month || !day) {
          return false;
        }

        const startedAt = Date.UTC(year, month - 1, day);
        return startedAt <= now && now - startedAt <= recentSeasonWindow;
      })
      .map(({ anilistId }) => anilistId)
  );
  const detailsById = new Map(sequelDetails.map(({ anilistId, data }) => [anilistId, data]));
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
      .filter(({ id }) => availableIds.has(id) && eligibleIds.has(id))
      .flatMap(({ id, title }) =>
        [...users].map((userId) => ({
          userId,
          kind: 'season_available' as const,
          anilistId: id,
          dedupeKey: `season_available:${id}`,
          facts: {
            title: title ?? `Anime ${id}`,
            parentTitle,
            eventDate: (() => {
              const start = detailsById.get(id)?.startDate;
              return start?.year && start.month && start.day
                ? `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`
                : null;
            })(),
          },
        }))
      )
  );
}

export async function getUnreadNotificationCount(userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(notification)
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        isNull(notification.dismissedAt)
      )
    );

  return row?.count ?? 0;
}

export async function markNotificationsRead(userId: string) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        isNull(notification.dismissedAt)
      )
    );
}

export async function clearNotifications(userId: string) {
  const dismissedAt = new Date();
  await db
    .update(notification)
    .set({ dismissedAt, readAt: dismissedAt })
    .where(and(eq(notification.userId, userId), isNull(notification.dismissedAt)));
}

export async function getNotifications(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.dismissedAt)))
    .orderBy(desc(notification.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  const ids = [...new Set(rows.map(({ anilistId }) => anilistId))];

  if (!ids.length) {
    return [];
  }

  const details = await db
    .select({ anilistId: animeDetailsCache.anilistId, data: animeDetailsCache.data })
    .from(animeDetailsCache)
    .where(inArray(animeDetailsCache.anilistId, ids));
  const detailById = new Map(details.map(({ anilistId, data }) => [anilistId, data]));
  const backdropById = await getStoredBackdrops(ids);

  return rows.flatMap((row) => {
    const media = detailById.get(row.anilistId);
    if (row.kind === 'season_available' && (!media || !recentSeason(media))) {
      return [];
    }
    if (row.facts.catchup === true && (!media || media.status !== 'RELEASING')) {
      return [];
    }

    const facts = row.facts;
    const title = typeof facts.title === 'string' ? facts.title : `Anime ${row.anilistId}`;
    const number =
      typeof facts.number === 'number'
        ? facts.number
        : typeof facts.episodeNumber === 'number'
          ? facts.episodeNumber
          : null;
    if (
      row.kind !== 'season_available' &&
      (number === null || !Number.isInteger(number) || number <= 0)
    ) {
      return [];
    }
    const episode = number === null ? '' : `Episode ${number}`;
    const isSeason = row.kind === 'season_available';
    const body = isSeason
      ? `${title} is now available to watch.`
      : facts.catchup === true
        ? `New episodes of ${title} are available through ${episode}.`
        : row.kind === 'dub_available'
          ? `${episode || 'A new episode'} of ${title} is now available dubbed.`
          : `${episode || 'A new episode'} of ${title} is now available to watch.`;
    const href = row.episodeId
      ? `/anime/${row.anilistId}/watch/${encodeURIComponent(row.episodeId)}`
      : `/anime/${row.anilistId}`;
    const eventValue =
      (typeof facts.eventDate === 'string' && facts.eventDate) ||
      row.createdAt.toISOString();
    const eventDate = eventValue
      ? new Intl.DateTimeFormat('en', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(eventValue))
      : null;

    return [
      {
        id: row.id,
        title,
        body,
        href,
        image: backdropById.get(row.anilistId) ?? null,
        actionLabel: isSeason ? 'View season' : 'Watch now',
        eventDate,
        createdAt: row.createdAt.getTime(),
      },
    ];
  });
}
