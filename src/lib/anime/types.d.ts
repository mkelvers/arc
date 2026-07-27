import type { AudioMode } from './audio';

export type AnimeCard = {
    id: number;
    href: string;
    watchHref: string;
    title: string;
    image: string;
    caption: string;
    score: number;
    genres: string[];
    synopsis: string;
};

export type AnimeEpisode = {
    id: string;
    number: number;
    label: string;
    title: string;
    href: string;
    audio: AudioMode[];
    image: string | null;
    duration: string;
    releaseDate: string;
    overview: string;
};
