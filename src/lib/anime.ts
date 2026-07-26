export type AudioMode = 'sub' | 'dub' | 'raw';
const audioOrder: AudioMode[] = ['sub', 'dub', 'raw'];

export interface AnimeEpisode {
    id: string;
    number: number;
    label: string;
    title: string;
    href: string;
    audio: AudioMode[];
    imageUrl: string | null;
    duration: string;
    airDate: string;
    overview: string;
}

export function formatAudioLabel(audio: readonly AudioMode[]) {
    if (audio.includes('sub') && audio.includes('dub')) return 'Sub | Dub';
    if (audio.includes('dub')) return 'Dub';
    if (audio.includes('sub')) return 'Subtitled';
    if (audio.includes('raw')) return 'Raw';
    return '';
}

export function mergeAudio(
    stored: readonly AudioMode[] = [],
    observed: readonly AudioMode[] = [],
) {
    const audio = new Set([...stored, ...observed]);
    return audioOrder.filter((mode) => audio.has(mode));
}

export function formatEpisodesAudioLabel(
    episodes: Pick<AnimeEpisode, 'audio'>[],
) {
    return formatAudioLabel(episodes.flatMap((episode) => episode.audio));
}

export interface AnimeCardData {
    id: number;
    href: string;
    playHref: string;
    title: string;
    imageUrl: string;
    secondaryLabel: string;
    score: number;
    genres: string[];
    synopsis: string;
}
