export interface AnimeEpisode {
    id: string;
    number: number;
    label: string;
    title: string;
    slug: string;
    href: string;
    audioLabel: string;
    imageUrl: string | null;
    duration: string;
    airDate: string;
    overview: string;
}
