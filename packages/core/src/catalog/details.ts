import type { AnimeQuery } from '@arc/shared/graphql/generated/graphql';
import { present } from '@arc/shared/utils/array';

type AniListAnimeDetailsMedia = Pick<
    NonNullable<AnimeQuery['Media']>,
    | 'id'
    | 'title'
    | 'bannerImage'
    | 'description'
    | 'genres'
    | 'format'
    | 'status'
    | 'season'
    | 'seasonYear'
    | 'nextAiringEpisode'
    | 'averageScore'
    | 'popularity'
    | 'favourites'
> &
    Partial<Pick<NonNullable<AnimeQuery['Media']>, 'rankings' | 'tags' | 'studios' | 'staff'>>;

const count = new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: 'compact',
});

const staffRoles = new Map([
    ['Original Creator', 'Original creator'],
    ['Director', 'Director'],
    ['Series Composition', 'Series composition'],
    ['Character Design', 'Character design'],
    ['Music', 'Music'],
]);

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

function formatDescription(value: string | null) {
    if (!value) {
        return '';
    }

    const description = value
        .replace(/<br\s*\/?\s*>/gi, '\n')
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

    for (const edge of present(media.staff?.edges)) {
        const name = edge.node?.name?.full?.trim();
        const role = edge.role ? staffRoles.get(edge.role) : undefined;

        if (name && role) {
            credits.set(name, [...(credits.get(name) ?? []), role]);
        }
    }

    return [...credits].map(([name, roles]) => `${name} (${roles.join(', ')})`).join(', ');
}

function formatRankings(media: AniListAnimeDetailsMedia) {
    const rankings = present(media.rankings).filter(({ type }) => type === 'POPULAR');
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
              ? media.nextAiringEpisode
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
        genres: present(media.genres),
        format: enumLabel(media.format),
        status: media.status,
        nextAiringEpisode,
        score: media.averageScore ?? 0,
        members: count.format(media.popularity ?? 0),
        favourites: count.format(media.favourites ?? 0),
        themes: present(media.tags)
            .filter((tag) => !tag.isGeneralSpoiler && !tag.isMediaSpoiler)
            .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0))
            .slice(0, 5)
            .map((tag) => tag.name),
        studios: present(media.studios?.nodes).map((studio) => studio.name),
        staff: formatStaff(media),
        rankings: formatRankings(media),
    };
}
