import { episodeAudioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';
import type { FranchiseOrder } from '$lib/anime/types';

export type FranchisePlaybackEpisode = {
    anilistId: number;
    episodeId: string;
    number: number;
    audio: AudioMode[];
};

export function withFranchisePlayback(
    entries: FranchiseOrder['entries'],
    episodes: FranchisePlaybackEpisode[]
) {
    const grouped = new Map<number, FranchisePlaybackEpisode[]>();

    for (const episode of episodes) {
        grouped.set(episode.anilistId, [...(grouped.get(episode.anilistId) ?? []), episode]);
    }

    return entries.map((entry) => {
        const available = grouped.get(entry.anilistId) ?? [];
        const first = available.toSorted((left, right) => left.number - right.number)[0];

        return {
            ...entry,
            audioLabel: episodeAudioAvailabilityLabel(available),
            link: first
                ? `/anime/${entry.anilistId}/watch/${encodeURIComponent(first.episodeId)}`
                : entry.href,
        };
    });
}
