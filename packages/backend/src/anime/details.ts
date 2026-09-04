import type { AniListAnime, AniListAnimeDetailsMedia } from './anilist/types';
import { z } from 'zod';

const storedAnimeDetailsSchema = z.looseObject({
    id: z.number().int(),
    title: z
        .object({
            english: z.string().nullable(),
            romaji: z.string().nullable(),
            native: z.string().nullable(),
        })
        .nullable(),
    bannerImage: z.string().nullable(),
    description: z.string().nullable(),
    genres: z.array(z.string().nullable()).nullable(),
    format: z.string().nullable(),
    status: z.string().nullable(),
    season: z.string().nullable(),
    seasonYear: z.number().int().nullable(),
    averageScore: z.number().nullable(),
    popularity: z.number().nullable(),
    favourites: z.number().nullable(),
    nextAiringEpisode: z
        .object({
            airingAt: z.number(),
            episode: z.number(),
        })
        .nullable(),
    rankings: z
        .array(
            z
                .object({
                    rank: z.number(),
                    type: z.string(),
                    year: z.number().nullable(),
                    season: z.string().nullable(),
                    allTime: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    tags: z
        .array(
            z
                .object({
                    name: z.string(),
                    rank: z.number().nullable(),
                    isGeneralSpoiler: z.boolean().nullable(),
                    isMediaSpoiler: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    studios: z
        .object({
            nodes: z
                .array(
                    z
                        .object({
                            name: z.string(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
    staff: z
        .object({
            edges: z
                .array(
                    z
                        .object({
                            role: z.string().nullable(),
                            node: z
                                .object({
                                    name: z
                                        .object({
                                            full: z.string().nullable(),
                                        })
                                        .nullable(),
                                })
                                .nullable(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

// Persisted JSON is intentionally unknown until this owning boundary validates it.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function parseStoredAnimeDetails(value: unknown) {
    const parsed = storedAnimeDetailsSchema.safeParse(value);
    return parsed.success ? (parsed.data as AniListAnime) : null;
}

const count = new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: 'compact',
});

function enumLabel(value: string | null | undefined, fallback = 'Unknown') {
    if (!value) {
        return fallback;
    }

    if (value === 'TV' || value === 'OVA' || value === 'ONA') {
        return value;
    }

    return value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/^./, (character) => character.toUpperCase());
}

const staffRoles = new Map([
    ['Original Creator', 'Original creator'],
    ['Director', 'Director'],
    ['Series Composition', 'Series composition'],
    ['Character Design', 'Character design'],
    ['Music', 'Music'],
]);

function formatDescription(value: string | null) {
    if (!value) {
        return '';
    }

    const description = value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split(/^\s*Notes:\s*$/im, 1)[0];

    const paragraphs = description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph && !/^\(Source:/i.test(paragraph));
    const summary = (paragraphs.length >= 5 ? paragraphs.slice(-3, -1) : paragraphs).join(' ');

    if (summary.length <= 520) {
        return summary;
    }

    const fragment = summary.slice(0, 520);
    const ending = [...fragment.matchAll(/[.!?]["']?(?=\s|$)/g)].at(-1);
    const cutoff = ending ? (ending.index ?? 0) + ending[0].length : 0;

    return cutoff >= 340 ? fragment.slice(0, cutoff) : `${fragment.trimEnd()}…`;
}

function formatStaff(media: AniListAnimeDetailsMedia) {
    const credits = new Map<string, string[]>();

    for (const edge of media.staff?.edges?.filter((value) => value !== null) ?? []) {
        const name = edge.node?.name?.full?.trim();
        const role = edge.role ? staffRoles.get(edge.role) : undefined;

        if (name && role) {
            credits.set(name, [...(credits.get(name) ?? []), role]);
        }
    }

    return [...credits].map(([name, roles]) => `${name} (${roles.join(', ')})`).join(', ');
}

function formatRankings(media: AniListAnimeDetailsMedia) {
    const rankings = (media.rankings?.filter((value) => value !== null) ?? []).filter(
        ({ type }) => type === 'POPULAR'
    );
    const seasonal = rankings.find(
        ({ season, year }) => season === media.season && year === media.seasonYear
    );
    const yearly = rankings.find(
        ({ season, allTime, year }) => !season && !allTime && year === media.seasonYear
    );
    const allTime = rankings.find((ranking) => ranking.allTime);

    return [
        seasonal &&
            `#${seasonal.rank} most popular of ${enumLabel(seasonal.season)} ${seasonal.year}`,
        yearly && `#${yearly.rank} most popular of ${yearly.year}`,
        allTime && `#${allTime.rank} most popular all time`,
    ].filter((ranking): ranking is string => Boolean(ranking));
}

export function toAnimeDetails(
    media: AniListAnimeDetailsMedia,
    description = media.description,
    storedAiringEpisode?: { episode: number; airingAt: number } | null
) {
    const nextAiringEpisode =
        storedAiringEpisode !== undefined
            ? storedAiringEpisode
            : media.nextAiringEpisode && media.nextAiringEpisode.airingAt * 1_000 > Date.now()
              ? {
                    episode: media.nextAiringEpisode.episode,
                    airingAt: media.nextAiringEpisode.airingAt,
                }
              : null;

    return {
        id: media.id,
        title:
            media.title?.english ??
            media.title?.romaji ??
            media.title?.native ??
            `Anime ${media.id}`,
        bannerImage: media.bannerImage ?? null,
        description: formatDescription(description),
        genres: media.genres?.filter((genre) => genre !== null) ?? [],
        format: enumLabel(media.format),
        status: media.status,
        nextAiringEpisode,
        score: media.averageScore ?? 0,
        members: count.format(media.popularity ?? 0),
        favourites: count.format(media.favourites ?? 0),
        themes: (media.tags?.filter((tag) => tag !== null) ?? [])
            .filter((tag) => !tag.isGeneralSpoiler && !tag.isMediaSpoiler)
            .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
            .slice(0, 5)
            .map((tag) => tag.name),
        studios: (media.studios?.nodes?.filter((studio) => studio !== null) ?? []).map(
            (studio) => studio.name
        ),
        staff: formatStaff(media),
        rankings: formatRankings(media),
    };
}
