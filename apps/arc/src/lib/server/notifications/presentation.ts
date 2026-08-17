import { audioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';
import type { NotificationEventInput } from './events';

interface NotificationFacts {
    kind: NotificationEventInput['kind'];
    anilistId: number;
    episodeId: string | null;
    episodeNumber: number | null;
    audio: readonly AudioMode[];
}

export function presentNotification(facts: NotificationFacts) {
    const episode = facts.episodeNumber === null ? null : `Episode ${facts.episodeNumber}`;
    let body: string;

    switch (facts.kind) {
        case 'season_announced':
            body = 'A new season has been announced for an anime in your library.';
            break;
        case 'season_available':
            body = episode
                ? `${episode} from the new season is now available to watch.`
                : 'The new season is now available to watch.';
            break;
        case 'episode_available':
            body = `${episode ?? 'A new episode'} is now ready to watch.`;
            break;
        case 'audio_available':
            body = `A new audio option is available for ${episode ?? 'this episode'}.`;
            break;
    }

    return {
        body,
        audioLabel: facts.audio.length ? audioAvailabilityLabel(facts.audio) : null,
        href: `/anime/${facts.anilistId}`,
        watchHref: facts.episodeId
            ? `/anime/${facts.anilistId}/watch/${encodeURIComponent(facts.episodeId)}`
            : null,
        actionLabel: facts.episodeId ? 'Watch Now' : null,
    };
}
