import { animeTitles } from '../anilist-text';
import type { AniListAnime } from '../anilist-types';
import { animeDate, dateTimestamp } from '../date';
import { normalizeTitle, releaseSequence } from './title';
import type { Candidate } from './types';

const day = 24 * 60 * 60 * 1_000;

export interface SpecialEpisodeEvidence {
    airDate: string;
    name: string;
    overview: string;
    runtime: number | null;
    seasonNumber: number;
    stillPath: string | null;
}

export interface TvSeasonEvidence {
    airDate: string | null;
    episodeCount: number;
    metadataCount?: number;
    name: string;
    releaseAirDate?: string | null;
    releaseEpisodeCount?: number;
    seasonNumber: number;
}

function releaseQualifiers(anime: AniListAnime) {
    const related = (anime.relations?.edges ?? []).flatMap((edge) =>
        edge?.node?.type === 'ANIME'
            ? [edge.node.title?.english, edge.node.title?.romaji, edge.node.title?.native]
            : []
    );
    const parentTitles = related
        .filter((title): title is string => Boolean(title?.trim()))
        .map(normalizeTitle);

    return animeTitles(anime)
        .flatMap((title) => {
            const normalized = normalizeTitle(title);
            const suffixes = parentTitles.flatMap((parent) =>
                normalized.startsWith(`${parent} `) ? [normalized.slice(parent.length).trim()] : []
            );

            return [normalized, ...suffixes];
        })
        .filter((title, index, titles) => title.length >= 5 && titles.indexOf(title) === index);
}

function seasonEvidenceScore(anime: AniListAnime, episodes: SpecialEpisodeEvidence[]) {
    const expected = anime.episodes ?? 0;
    const start = dateTimestamp(animeDate(anime.startDate));
    const end = dateTimestamp(animeDate(anime.endDate)) ?? start;
    const startYear = anime.startDate?.year ?? anime.seasonYear ?? null;
    const relevant = episodes.filter((episode) => {
        const aired = dateTimestamp(episode.airDate);

        if (aired !== null && start !== null && end !== null) {
            return aired >= start - 14 * day && aired <= end + 14 * day;
        }

        return startYear !== null && Number(episode.airDate.slice(0, 4)) === startYear;
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

    if (start !== null && relevant.some((episode) => dateTimestamp(episode.airDate) === start)) {
        score += 60;
    }

    if (anime.duration) {
        const duration = anime.duration;
        const matchingRuntime = relevant.filter(
            ({ runtime }) => runtime !== null && Math.abs(runtime - duration) <= 3
        ).length;
        score += (30 * matchingRuntime) / relevant.length;
    }

    const qualifiers = releaseQualifiers(anime);
    const matchingTitles = relevant.filter(({ name }) => {
        const title = normalizeTitle(name);

        return qualifiers.some(
            (qualifier) => title.includes(qualifier) || qualifier.includes(title)
        );
    }).length;
    score += (45 * matchingTitles) / relevant.length;

    const complete = relevant.filter(
        ({ overview, stillPath }) => overview.trim() && stillPath
    ).length;
    score += (15 * complete) / relevant.length;

    if (relevant[0]?.seasonNumber === 0) {
        score += 15;
    }

    return score;
}

export function specialEpisodeEvidenceScore(
    anime: AniListAnime,
    episodes: SpecialEpisodeEvidence[]
) {
    const seasons = new Map<number, SpecialEpisodeEvidence[]>();
    episodes.forEach((episode) => {
        const season = seasons.get(episode.seasonNumber) ?? [];
        season.push(episode);
        seasons.set(episode.seasonNumber, season);
    });

    return Math.max(
        0,
        ...[...seasons.values()].map((season) => seasonEvidenceScore(anime, season))
    );
}

export function relatedSpecialMappingIsBetter(
    directScore: number | null,
    relatedScore: number | null
) {
    return (
        relatedScore !== null &&
        relatedScore >= 160 &&
        (directScore === null || relatedScore >= directScore + 25)
    );
}

function tvReleaseEvidence(anime: AniListAnime, seasons: TvSeasonEvidence[]) {
    const expectedEpisodes = anime.episodes ?? 0;
    const expectedStart = dateTimestamp(animeDate(anime.startDate));
    const expectedYear = anime.startDate?.year ?? anime.seasonYear ?? null;
    const expectedSequence = releaseSequence(anime);
    const titles = animeTitles(anime).map(normalizeTitle);

    return (
        seasons
            .filter(({ seasonNumber }) => seasonNumber > 0)
            .map((season) => {
                const complete =
                    expectedEpisodes > 0 &&
                    (season.episodeCount === expectedEpisodes ||
                        season.releaseEpisodeCount === expectedEpisodes);
                const airDate = dateTimestamp(season.releaseAirDate ?? season.airDate);
                const seasonTitle = normalizeTitle(season.name);
                let score = complete ? 120 : 0;

                if (expectedStart !== null && airDate === expectedStart) {
                    score += 60;
                } else if (expectedYear && Number(season.airDate?.slice(0, 4)) === expectedYear) {
                    score += 20;
                }

                if (titles.includes(seasonTitle)) {
                    score += 80;
                }

                if (expectedSequence && season.seasonNumber === expectedSequence) {
                    score += 60;
                }

                if (
                    expectedEpisodes > 0 &&
                    season.releaseEpisodeCount === expectedEpisodes &&
                    season.metadataCount !== undefined
                ) {
                    score +=
                        (80 * Math.min(season.metadataCount, expectedEpisodes)) / expectedEpisodes;
                }

                return { complete, score };
            })
            .sort((left, right) => right.score - left.score)[0] ?? { complete: false, score: 0 }
    );
}

export function tvReleaseMatchesWindow(anime: AniListAnime, seasons: TvSeasonEvidence[]) {
    const expectedEpisodes = anime.episodes;
    if (!expectedEpisodes || expectedEpisodes <= 0) {
        return false;
    }

    const releaseSeasons = seasons.filter(
        ({ seasonNumber, releaseEpisodeCount }) =>
            seasonNumber > 0 && releaseEpisodeCount !== undefined && releaseEpisodeCount > 0
    );
    const releaseEpisodeCount = releaseSeasons.reduce(
        (total, season) => total + (season.releaseEpisodeCount ?? 0),
        0
    );
    const expectedStart = animeDate(anime.startDate);

    return (
        releaseSeasons.length > 0 &&
        releaseEpisodeCount === expectedEpisodes &&
        (expectedStart === null ||
            releaseSeasons.some((season) => season.releaseAirDate === expectedStart))
    );
}

export function preferredTvReleaseCandidate(
    anime: AniListAnime,
    direct: Candidate,
    candidates: { candidate: Candidate; seasons: TvSeasonEvidence[] }[]
) {
    const directEvidence = candidates.find(
        ({ candidate }) => candidate.id === direct.id && candidate.mediaType === direct.mediaType
    );
    const directScore = tvReleaseEvidence(anime, directEvidence?.seasons ?? []);
    const alternative = candidates
        .filter(
            ({ candidate }) =>
                candidate.mediaType === 'tv' &&
                (candidate.id !== direct.id || candidate.mediaType !== direct.mediaType)
        )
        .map((evidence) => ({
            ...evidence,
            ...tvReleaseEvidence(anime, evidence.seasons),
        }))
        .filter(({ complete, score }) => complete && score >= 200)
        .sort((left, right) => right.score - left.score)[0];
    return alternative && (!directScore.complete || alternative.score > directScore.score)
        ? alternative.candidate
        : direct;
}
