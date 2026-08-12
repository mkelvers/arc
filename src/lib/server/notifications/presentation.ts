import { audioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';

export type NotificationKind =
    | 'season_announced'
    | 'season_available'
    | 'episode_available'
    | 'audio_available';

export interface NotificationFacts {
    kind: NotificationKind;
    anilistId: number;
    episodeId: string | null;
    episodeNumber: number | null;
    audio: readonly AudioMode[];
}

export function notificationAudioLabel(audio: readonly AudioMode[]) {
    return audio.length ? audioAvailabilityLabel(audio) : null;
}

export function notificationBody(facts: NotificationFacts) {
    const episode = facts.episodeNumber === null ? null : `Episode ${facts.episodeNumber}`;

    switch (facts.kind) {
        case 'season_announced':
            return 'A new season has been announced for an anime in your library.';
        case 'season_available':
            return episode
                ? `${episode} from the new season is now available to watch.`
                : 'The new season is now available to watch.';
        case 'episode_available':
            return `${episode ?? 'A new episode'} is now ready to watch.`;
        case 'audio_available':
            return `A new audio option is available for ${episode ?? 'this episode'}.`;
    }
}

export function notificationHref(facts: Pick<NotificationFacts, 'anilistId'>) {
    return `/anime/${facts.anilistId}`;
}

export function notificationWatchHref(facts: Pick<NotificationFacts, 'anilistId' | 'episodeId'>) {
    return facts.episodeId
        ? `/anime/${facts.anilistId}/watch/${encodeURIComponent(facts.episodeId)}`
        : null;
}
