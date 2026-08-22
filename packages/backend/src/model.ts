import { z } from 'zod';

export const audioModeOrder = ['sub', 'dub', 'raw'] as const;
export type AudioMode = (typeof audioModeOrder)[number];

export const AnimeCardSchema = z.object({
    id: z.number().int().positive(),
    href: z.string(),
    link: z.string(),
    title: z.string(),
    image: z.string(),
    audioLabel: z.string(),
    format: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
});

export type AnimeCard = z.infer<typeof AnimeCardSchema>;

export type EpisodeType = 'canon' | 'mixed' | 'filler' | 'recap' | 'anime-canon' | 'unknown';

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
    type: EpisodeType;
};

export function audioAvailabilityLabel(modes: readonly AudioMode[]) {
    const ordered = [...new Set(modes)]
        .toSorted((left, right) => audioModeOrder.indexOf(left) - audioModeOrder.indexOf(right))
        .map((mode) => (mode === 'raw' ? 'sub' : mode));
    const available = [...new Set(ordered)];
    if (available.length === 1 && available[0] === 'sub') {
        return 'Subtitled';
    }
    if (available.length === 1 && available[0] === 'dub') {
        return 'Dubbed';
    }
    return (['dub', 'sub'] as const)
        .filter((mode) => available.includes(mode))
        .map((mode) => (mode === 'dub' ? 'Dub' : 'Sub'))
        .join(' | ');
}
