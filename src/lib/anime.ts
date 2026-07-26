export interface AnimeEpisode {
    id: string;
    number: number;
    label: string;
    title: string;
    slug: string;
    href: string;
    hasSub: boolean;
    hasDub: boolean;
    audioLabel: string;
    imageUrl: string | null;
    duration: string;
    airDate: string;
    overview: string;
}

export function formatAudioLabel(hasSub: boolean, hasDub: boolean) {
    if (hasSub && hasDub) return 'Sub | Dub';
    if (hasDub) return 'Dub';
    if (hasSub) return 'Subtitled';
    return '';
}

export function formatEpisodesAudioLabel(
    episodes: Pick<AnimeEpisode, 'hasSub' | 'hasDub'>[],
) {
    return formatAudioLabel(
        episodes.some((episode) => episode.hasSub),
        episodes.some((episode) => episode.hasDub),
    );
}

export interface AnimeCardData {
    id: number;
    href: string;
    playHref: string;
    title: string;
    imageUrl: string;
    audioLabel: string;
    score: number;
    genres: string[];
    synopsis: string;
}
