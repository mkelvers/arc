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
