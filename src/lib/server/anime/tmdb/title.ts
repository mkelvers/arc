import type { AniListAnime } from '../anilist/types';
import type { Candidate } from './types';

const romanReleaseSuffix = /\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const romanReleaseNumbers: Readonly<Record<string, number>> = {
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10,
};

export function normalizeTitle(title: string) {
    return title
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

export function seriesTitle(title: string) {
    let value = normalizeTitle(title);
    let previous = '';

    while (value !== previous) {
        previous = value;
        value = value
            .replace(/\s+(?:(?:season|part|cour)\s+\d+|\d+(?:st|nd|rd|th)\s+season)$/, '')
            .replace(/\s+final\s+season$/, '')
            .replace(romanReleaseSuffix, '')
            .replace(/\s+(?:the\s+)?movie$/, '')
            .replace(/\s+(?:19|20)\d{2}$/, '')
            .replace(/\s+(?:第\s*)?\d+\s*期$/u, '')
            .trim();
    }

    return value;
}

export function titlesFor(anime: AniListAnime) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index
    );
}

export function releaseSequence(anime: AniListAnime) {
    for (const title of titlesFor(anime)) {
        const normalized = normalizeTitle(title);
        const numeric =
            normalized.match(/\bseason\s+0*(\d+)\b/)?.[1] ??
            normalized.match(/\b0*(\d+)(?:st|nd|rd|th)\s+season\b/)?.[1] ??
            normalized.match(/(?:^|\s)0*(\d+)\s*期$/u)?.[1];
        const roman = normalized.match(romanReleaseSuffix)?.[1];
        const sequence = numeric ? Number(numeric) : roman ? romanReleaseNumbers[roman] : null;

        if (sequence && Number.isSafeInteger(sequence)) {
            return sequence;
        }
    }

    return null;
}

export function isSpecialRelease(anime: AniListAnime) {
    return (
        anime.format === 'OVA' ||
        anime.format === 'SPECIAL' ||
        (anime.format === 'ONA' &&
            Boolean(
                (anime.episodes && anime.episodes <= 3) || (anime.duration && anime.duration <= 5)
            ) &&
            (anime.relations?.edges ?? []).some(
                (edge) => edge?.relationType === 'PARENT' && edge.node?.type === 'ANIME'
            ))
    );
}

export function mappingTitles(anime: AniListAnime) {
    return [
        ...titlesFor(anime).slice(0, 3),
        ...(anime.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType === 'ADAPTATION' ||
            (isSpecialRelease(anime) && edge?.relationType === 'PARENT')
                ? [edge.node?.title?.english, edge.node?.title?.romaji, edge.node?.title?.native]
                : []
        ),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index
    );
}

export function candidateScore(candidate: Candidate, anime: AniListAnime) {
    const mapping = mappingTitles(anime);
    const primaryTitles = titlesFor(anime);
    const titles = mapping.map(normalizeTitle);
    const primary = primaryTitles.map(normalizeTitle);
    const names = [candidate.name, candidate.originalName].map(normalizeTitle);
    const compact = (value: string) => value.replace(/\s+/g, '');
    const matches = (left: string, right: string) =>
        left === right || compact(left) === compact(right);
    const exactPrimary = names.some((name) => primary.some((title) => matches(name, title)));
    const exact = names.some((name) => titles.some((title) => matches(name, title)));
    const exactAlias = exact && !exactPrimary;
    const series = mapping.map(seriesTitle);
    const exactSeries = names.some((name) =>
        series.some((title) => matches(seriesTitle(name), title))
    );
    const qualified =
        primaryTitles.some((title) => seriesTitle(title) !== normalizeTitle(title)) || exactAlias;
    const partial = names.some((name) =>
        titles.some((title) => name.includes(title) || title.includes(name))
    );
    const animeYear = anime.startDate?.year ?? anime.seasonYear;
    const candidateYear = Number(candidate.date?.slice(0, 4)) || null;
    const yearDistance = animeYear && candidateYear ? Math.abs(animeYear - candidateYear) : 0;
    const titleScore = exactPrimary ? 110 : exact ? 100 : exactSeries ? 95 : partial ? 55 : 0;
    const aggregate =
        candidate.mediaType === 'tv' &&
        exactSeries &&
        qualified &&
        Boolean(animeYear && candidateYear && candidateYear <= animeYear);
    const yearScore =
        animeYear && candidateYear
            ? animeYear === candidateYear || aggregate
                ? 15
                : -Math.min(yearDistance * 8, 40)
            : 0;

    return titleScore + yearScore + Math.log10(candidate.popularity + 1);
}
