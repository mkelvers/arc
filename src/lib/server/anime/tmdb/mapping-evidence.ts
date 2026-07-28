import type { AniListAnime } from './types';
import { normalizeTitle, titlesFor } from './title';

const day = 24 * 60 * 60 * 1_000;

export interface SpecialEpisodeEvidence {
    airDate: string;
    name: string;
    overview: string;
    runtime: number | null;
    seasonNumber: number;
    stillPath: string | null;
}

function animeDate(
    value:
        | {
              year?: number | null;
              month?: number | null;
              day?: number | null;
          }
        | null
        | undefined,
) {
    const { year, month, day: date } = value ?? {};

    return year && month && date
        ? `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
        : null;
}

function timestamp(value: string | null) {
    if (!value) {
        return null;
    }

    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

function releaseQualifiers(anime: AniListAnime) {
    const related = (anime.relations?.edges ?? []).flatMap((edge) =>
        edge?.node?.type === 'ANIME'
            ? [
                  edge.node.title?.english,
                  edge.node.title?.romaji,
                  edge.node.title?.native,
              ]
            : [],
    );
    const parentTitles = related
        .filter((title): title is string => Boolean(title?.trim()))
        .map(normalizeTitle);

    return titlesFor(anime)
        .flatMap((title) => {
            const normalized = normalizeTitle(title);
            const suffixes = parentTitles.flatMap((parent) =>
                normalized.startsWith(`${parent} `)
                    ? [normalized.slice(parent.length).trim()]
                    : [],
            );

            return [normalized, ...suffixes];
        })
        .filter(
            (title, index, titles) =>
                title.length >= 5 && titles.indexOf(title) === index,
        );
}

function seasonEvidenceScore(
    anime: AniListAnime,
    episodes: SpecialEpisodeEvidence[],
) {
    const expected = anime.episodes ?? 0;
    const start = timestamp(animeDate(anime.startDate));
    const end = timestamp(animeDate(anime.endDate)) ?? start;
    const startYear = anime.startDate?.year ?? anime.seasonYear ?? null;
    const relevant = episodes.filter((episode) => {
        const aired = timestamp(episode.airDate);

        if (aired !== null && start !== null && end !== null) {
            return aired >= start - 14 * day && aired <= end + 14 * day;
        }

        return (
            startYear !== null &&
            Number(episode.airDate.slice(0, 4)) === startYear
        );
    });

    if (!relevant.length) {
        return 0;
    }

    let score = 0;
    if (expected > 0) {
        const difference = Math.abs(relevant.length - expected);
        score +=
            difference === 0
                ? 120
                : relevant.length < expected
                  ? (60 * relevant.length) / expected
                  : Math.max(20, 70 - difference * 10);
    } else {
        score += 40;
    }

    if (
        start !== null &&
        relevant.some((episode) => timestamp(episode.airDate) === start)
    ) {
        score += 60;
    }

    if (anime.duration) {
        const duration = anime.duration;
        const matchingRuntime = relevant.filter(
            ({ runtime }) =>
                runtime !== null && Math.abs(runtime - duration) <= 3,
        ).length;
        score += (30 * matchingRuntime) / relevant.length;
    }

    const qualifiers = releaseQualifiers(anime);
    const matchingTitles = relevant.filter(({ name }) => {
        const title = normalizeTitle(name);

        return qualifiers.some(
            (qualifier) =>
                title.includes(qualifier) || qualifier.includes(title),
        );
    }).length;
    score += (45 * matchingTitles) / relevant.length;

    const complete = relevant.filter(
        ({ overview, stillPath }) => overview.trim() && stillPath,
    ).length;
    score += (15 * complete) / relevant.length;

    if (relevant[0]?.seasonNumber === 0) {
        score += 15;
    }

    return score;
}

export function specialEpisodeEvidenceScore(
    anime: AniListAnime,
    episodes: SpecialEpisodeEvidence[],
) {
    const seasons = new Map<number, SpecialEpisodeEvidence[]>();
    episodes.forEach((episode) => {
        const season = seasons.get(episode.seasonNumber) ?? [];
        season.push(episode);
        seasons.set(episode.seasonNumber, season);
    });

    return Math.max(
        0,
        ...[...seasons.values()].map((season) =>
            seasonEvidenceScore(anime, season),
        ),
    );
}

export function relatedSpecialMappingIsBetter(
    directScore: number | null,
    relatedScore: number | null,
) {
    return (
        relatedScore !== null &&
        relatedScore >= 160 &&
        (directScore === null || relatedScore >= directScore + 25)
    );
}
