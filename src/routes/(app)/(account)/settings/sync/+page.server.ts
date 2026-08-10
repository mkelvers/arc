import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  SyncMediaListDocument,
  type MediaListStatus,
} from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { graphql } from '$lib/server/graphql';
import { accounts, syncSettings } from '$lib/server/db/schema';
import { applyWatchlistEntries } from '$lib/server/watchlist';
import type { Actions, PageServerLoad } from './$types';

const settingSchema = z.enum([
  'automaticSync',
  'episodeProgress',
  'watchingStatus',
  'importAnilistChanges',
]);
function watchlistState(status: MediaListStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'completed' as const;
    case 'CURRENT':
    case 'REPEATING':
      return 'watching' as const;
    case 'DROPPED':
      return 'dropped' as const;
    case 'PAUSED':
    case 'PLANNING':
      return 'plan_to_watch' as const;
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const userId = locals.user.id;
  const settings = await db.query.syncSettings.findFirst({
    where: (setting, { eq }) => eq(setting.userId, userId),
  });
  const anilistAccount = await db.query.accounts.findFirst({
    columns: { id: true },
    where: (account, { and, eq }) =>
      and(eq(account.userId, userId), eq(account.providerId, 'anilist')),
  });

  return {
    anilistConnected: Boolean(anilistAccount),
    settings: settings ?? {
      automaticSync: false,
      episodeProgress: false,
      watchingStatus: false,
      importAnilistChanges: false,
      lastSyncedAt: null,
    },
  };
};

export const actions: Actions = {
  update: async ({ locals, request }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    const form = await request.formData();
    const setting = settingSchema.safeParse(form.get('setting'));
    const enabled = form.get('enabled') === 'true';

    if (!setting.success) {
      return fail(400, { message: 'Invalid sync setting.' });
    }

    const values = {
      userId: locals.user.id,
      [setting.data]: enabled,
      updatedAt: new Date(),
    };

    await db
      .insert(syncSettings)
      .values(values)
      .onConflictDoUpdate({ target: syncSettings.userId, set: values });

    return { success: true };
  },
  sync: async ({ locals }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    const userId = locals.user.id;
    const [account, settings] = await Promise.all([
      db.query.accounts.findFirst({
        columns: { accessToken: true, accountId: true },
        where: (entry, { and, eq }) =>
          and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
      }),
      db.query.syncSettings.findFirst({
        where: (entry, { eq }) => eq(entry.userId, userId),
      }),
    ]);

    if (!account?.accessToken) {
      return fail(400, { message: 'Connect AniList before syncing.' });
    }

    if (!settings) {
      return fail(400, { message: 'Choose at least one sync option before syncing.' });
    }

    if (!settings.importAnilistChanges && !settings.watchingStatus && !settings.episodeProgress) {
      return fail(400, { message: 'Choose at least one sync option before syncing.' });
    }

    const accountId = Number(account.accountId);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      return fail(502, { message: 'The AniList account could not be identified.' });
    }

    let response;
    try {
      response = await graphql(
        'https://graphql.anilist.co',
        SyncMediaListDocument,
        { userId: accountId },
        { headers: { Authorization: `Bearer ${account.accessToken}` } }
      );
    } catch {
      return fail(502, { message: 'AniList could not be reached.' });
    }

    const entries =
      settings.watchingStatus || settings.importAnilistChanges
        ? (response.MediaListCollection?.lists?.flatMap(
            (list) =>
              list?.entries?.flatMap((entry) => {
                if (!entry?.media?.id || !entry.status) {
                  return [];
                }

                return [{ anilistId: entry.media.id, state: watchlistState(entry.status) }];
              }) ?? []
          ) ?? [])
        : [];
    const syncedAt = new Date();

    await applyWatchlistEntries(userId, entries);
    await db
      .update(syncSettings)
      .set({ lastSyncedAt: syncedAt, updatedAt: syncedAt })
      .where(eq(syncSettings.userId, userId));

    return { success: true, message: 'Sync complete.' };
  },
};
