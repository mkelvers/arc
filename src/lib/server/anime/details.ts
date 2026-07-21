import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

type Anime = NonNullable<AnimeQuery['Media']>;

const count = new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: 'compact',
});

const staffRoles = {
    'Original Creator': 'Original creator',
    Director: 'Director',
    'Series Composition': 'Series composition',
    'Character Design': 'Character design',
    Music: 'Music',
} as const;

type StaffRole = keyof typeof staffRoles;

function isStaffRole(role: string | null): role is StaffRole {
    return role !== null && role in staffRoles;
}

function present<T>(values: ReadonlyArray<T | null> | null | undefined): T[] {
    return values?.filter((value): value is T => value !== null) ?? [];
}

function formatEnum(value: string | null | undefined) {
    if (!value) return 'Unknown';
    if (['TV', 'OVA', 'ONA'].includes(value)) return value;

    return value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/^./, (character) => character.toUpperCase());
}

function formatDescription(value: string | null) {
    if (!value) return '';

    const description = value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split(/^\s*Notes:\s*$/im, 1)[0];

    const paragraphs = description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph && !/^\(Source:/i.test(paragraph));
    const summary = (
        paragraphs.length >= 5 ? paragraphs.slice(-3, -1) : paragraphs
    ).join(' ');

    if (summary.length <= 520) return summary;

    const fragment = summary.slice(0, 520);
    const ending = [...fragment.matchAll(/[.!?]["']?(?=\s|$)/g)].at(-1);
    const cutoff = ending ? (ending.index ?? 0) + ending[0].length : 0;

    return cutoff >= 340 ? fragment.slice(0, cutoff) : `${fragment.trimEnd()}…`;
}

function formatStaff(media: Anime) {
    const credits = new Map<string, string[]>();

    for (const edge of present(media.staff?.edges)) {
        const name = edge.node?.name?.full?.trim();

        if (name && isStaffRole(edge.role)) {
            credits.set(name, [
                ...(credits.get(name) ?? []),
                staffRoles[edge.role],
            ]);
        }
    }

    return [...credits]
        .map(([name, roles]) => `${name} (${roles.join(', ')})`)
        .join(', ');
}

function formatRankings(media: Anime) {
    const rankings = present(media.rankings).filter(
        ({ type }) => type === 'POPULAR',
    );
    const seasonal = rankings.find(
        ({ season, year }) =>
            season === media.season && year === media.seasonYear,
    );
    const yearly = rankings.find(
        ({ season, allTime, year }) =>
            !season && !allTime && year === media.seasonYear,
    );
    const allTime = rankings.find((ranking) => ranking.allTime);

    return [
        seasonal &&
            `#${seasonal.rank} most popular of ${formatEnum(seasonal.season)} ${seasonal.year}`,
        yearly && `#${yearly.rank} most popular of ${yearly.year}`,
        allTime && `#${allTime.rank} most popular all time`,
    ].filter((ranking): ranking is string => Boolean(ranking));
}

export function toAnimeDetails(media: Anime) {
    return {
        id: media.id,
        title:
            media.title?.english ??
            media.title?.romaji ??
            media.title?.native ??
            `Anime ${media.id}`,
        description: formatDescription(media.description),
        genres: present(media.genres),
        format: formatEnum(media.format),
        score: media.averageScore ?? 0,
        members: count.format(media.popularity ?? 0),
        favourites: count.format(media.favourites ?? 0),
        themes: present(media.tags)
            .filter((tag) => !tag.isGeneralSpoiler && !tag.isMediaSpoiler)
            .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
            .slice(0, 5)
            .map((tag) => tag.name),
        studios: present(media.studios?.nodes).map((studio) => studio.name),
        staff: formatStaff(media),
        rankings: formatRankings(media),
    };
}
