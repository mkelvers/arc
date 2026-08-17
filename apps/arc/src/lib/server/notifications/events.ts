import { mergeAudioModes, type AudioMode } from '$lib/anime/audio';
import type { EpisodeAvailabilityTransition } from '$lib/server/anime/episodes/policy';

interface NotificationInterestRecipient {
    userId: string;
    sourceAnilistId: number;
}

export interface NotificationEventInput {
    userId: string;
    kind: 'season_announced' | 'season_available' | 'episode_available' | 'audio_available';
    anilistId: number;
    sourceAnilistId: number;
    title: string;
    episodeId: string | null;
    episodeNumber: number | null;
    audio: AudioMode[];
    dedupeKey: string;
    occurredAt: Date | null;
}

function airDate(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function notificationInputsForTransitions(
    anilistId: number,
    title: string,
    interests: readonly NotificationInterestRecipient[],
    transitions: readonly EpisodeAvailabilityTransition[]
) {
    return transitions.flatMap((transition) =>
        interests.map((interest): NotificationEventInput => {
            const isSequelPremiere =
                transition.kind === 'episode_available' &&
                transition.number === 1 &&
                interest.sourceAnilistId !== anilistId;
            const kind = isSequelPremiere ? 'season_available' : transition.kind;
            const audio = mergeAudioModes([], transition.audio);
            const dedupeKey =
                kind === 'season_available'
                    ? `${kind}:${anilistId}`
                    : kind === 'audio_available'
                      ? `${kind}:${anilistId}:${transition.episodeId}:${audio.join(',')}`
                      : `${kind}:${anilistId}:${transition.episodeId}`;

            return {
                userId: interest.userId,
                kind,
                anilistId,
                sourceAnilistId: interest.sourceAnilistId,
                title,
                episodeId: transition.episodeId,
                episodeNumber: transition.number,
                audio,
                dedupeKey,
                occurredAt: airDate(transition.airDate) ?? transition.observedAt ?? null,
            };
        })
    );
}

export function notificationInputsForInitialAvailability(
    release: {
        anilistId: number;
        title: string;
        status: string | null;
        episodeId: string;
        episodeNumber: number;
        audio: readonly AudioMode[];
        airDate: string | null;
        observedAt?: Date;
    },
    interests: readonly NotificationInterestRecipient[]
) {
    if (release.status !== 'RELEASING') {
        return [];
    }

    return interests.flatMap((interest): NotificationEventInput[] => {
        if (interest.sourceAnilistId === release.anilistId) {
            return [];
        }

        return [
            {
                userId: interest.userId,
                kind: 'season_available',
                anilistId: release.anilistId,
                sourceAnilistId: interest.sourceAnilistId,
                title: release.title,
                episodeId: release.episodeId,
                episodeNumber: release.episodeNumber,
                audio: mergeAudioModes([], release.audio),
                dedupeKey: `season_available:${release.anilistId}`,
                occurredAt: airDate(release.airDate) ?? release.observedAt ?? null,
            },
        ];
    });
}
