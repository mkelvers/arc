import { episodeAudioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { FranchiseOrder } from '@arc/shared/types';
import { watchEpisodeHref } from '../episodes/route';

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
            link: first ? watchEpisodeHref(entry.anilistId, first.number) : entry.href,
        };
    });
}
