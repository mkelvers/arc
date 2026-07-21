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

export function episodeSlug(title: string, id: string) {
    const slug = title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || `episode-${id}`;
}
