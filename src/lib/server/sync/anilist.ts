import {
  DeleteSyncMediaListEntryDocument,
  FindSyncMediaListEntryDocument,
} from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { graphql } from '$lib/server/graphql';
import { anilistRequestPolicy } from '$lib/server/anime/anilist/request-policy';

export async function removeAniListEntry(userId: string, anilistId: number) {
  const [account, settings] = await Promise.all([
    db.query.accounts.findFirst({
      columns: { accessToken: true, accountId: true },
      where: (entry, { and, eq }) => and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
    }),
    db.query.syncSettings.findFirst({ where: (entry, { eq }) => eq(entry.userId, userId) }),
  ]);

  if (!account?.accessToken || !settings?.watchingStatus) {
    return;
  }

  const userIdOnAniList = Number(account.accountId);
  if (!Number.isSafeInteger(userIdOnAniList) || userIdOnAniList <= 0) {
    return;
  }

  const entry = await anilistRequestPolicy.run(() =>
    graphql(
      'https://graphql.anilist.co',
      FindSyncMediaListEntryDocument,
      { mediaId: anilistId, userId: userIdOnAniList },
      { headers: { Authorization: `Bearer ${account.accessToken}` } }
    )
  );
  if (!entry.MediaList?.id) {
    return;
  }
  const mediaListId = entry.MediaList.id;

  await anilistRequestPolicy.run(() =>
    graphql(
      'https://graphql.anilist.co',
      DeleteSyncMediaListEntryDocument,
      { id: mediaListId },
      { headers: { Authorization: `Bearer ${account.accessToken}` } }
    )
  );
}
