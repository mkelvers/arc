import { eq } from 'drizzle-orm';

import type { AudioMode } from '$lib/anime/audio';
import { mediaTitle } from '$lib/server/anime/anilist/text';
import type { AniListAnime } from '$lib/server/anime/anilist/types';
import type { EpisodeAvailabilityTransition } from '$lib/server/anime/episodes/policy';
import type { DatabaseTransaction } from '$lib/server/db';
import { notificationInterest } from '$lib/server/db/schema';
import {
    notificationInputsForInitialAvailability,
    notificationInputsForTransitions,
} from './events';
import { persistNotificationEvents } from './persist';

export async function recordProviderEpisodeChanges(
    tx: DatabaseTransaction,
    anime: AniListAnime,
    hadSuccessfulSync: boolean,
    transitions: readonly EpisodeAvailabilityTransition[],
    latestEpisode: {
        episodeId: string;
        episodeNumber: number;
        audio: readonly AudioMode[];
        airDate: string | null;
        observedAt: Date;
    } | null
) {
    const interests = await tx
        .select({
            userId: notificationInterest.userId,
            sourceAnilistId: notificationInterest.sourceAnilistId,
        })
        .from(notificationInterest)
        .where(eq(notificationInterest.anilistId, anime.id));
    if (!interests.length) {
        return [];
    }

    const title = mediaTitle(anime);
    const inputs = hadSuccessfulSync
        ? notificationInputsForTransitions(anime.id, title, interests, transitions)
        : latestEpisode
          ? notificationInputsForInitialAvailability(
                {
                    anilistId: anime.id,
                    title,
                    status: anime.status,
                    ...latestEpisode,
                },
                interests
            )
          : [];

    return persistNotificationEvents(inputs, tx);
}
