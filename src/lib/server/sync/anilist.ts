import {
    DeleteSyncMediaListEntryDocument,
    FindSyncMediaListEntryDocument,
} from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { GraphQLRequestError, graphql } from '$lib/server/graphql';
import { anilistRequestPolicy } from '$lib/server/anime/anilist/request-policy';

export async function removeAniListEntry(userId: string, anilistId: number) {
    const account = await db.query.accounts.findFirst({
        columns: { accessToken: true, accountId: true },
        where: (entry, { and, eq }) =>
            and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
    });

    if (!account?.accessToken) {
        return;
    }

    const userIdOnAniList = Number(account.accountId);
    if (!Number.isSafeInteger(userIdOnAniList) || userIdOnAniList <= 0) {
        return;
    }

    let entry;
    try {
        entry = await anilistRequestPolicy.run(() =>
            graphql(
                'https://graphql.anilist.co',
                FindSyncMediaListEntryDocument,
                { mediaId: anilistId, userId: userIdOnAniList },
                { headers: { Authorization: `Bearer ${account.accessToken}` } }
            )
        );
    } catch (cause) {
        if (cause instanceof GraphQLRequestError && cause.status === 404) {
            return;
        }

        throw cause;
    }
    if (!entry.MediaList?.id) {
        return;
    }
    const mediaListId = entry.MediaList.id;

    try {
        await anilistRequestPolicy.run(() =>
            graphql(
                'https://graphql.anilist.co',
                DeleteSyncMediaListEntryDocument,
                { id: mediaListId },
                { headers: { Authorization: `Bearer ${account.accessToken}` } }
            )
        );
    } catch (cause) {
        if (cause instanceof GraphQLRequestError && cause.status === 404) {
            return;
        }

        throw cause;
    }
}
