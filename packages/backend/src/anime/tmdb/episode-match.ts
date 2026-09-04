import { animeTitles } from '@arc/core';
import type { AniListAnime } from '@arc/core';
import { animeDate, dateTimestamp } from '@arc/core';
import type { ProviderEpisode } from '../providers/types';
import { episodeTitleKey, episodeTitleScore, isSpecialEpisodeReference } from '../providers/match';
import { isSpecialRelease } from './title';
import type { EpisodeCandidate } from './types';

const day = 24 * 60 * 60 * 1_000;
const maximumBroadcastDelay = 14 * day;

function daysBetween(left: number, right: number) {
    return Math.abs(left - right) / day;
}

function dateScore(
    anime: AniListAnime,
    sourceIndex: number,
    sourceLength: number,
    candidate: EpisodeCandidate
) {
    const candidateTime = dateTimestamp(candidate.rawAirDate);
    const startTime = dateTimestamp(animeDate(anime.startDate));
    const endTime = dateTimestamp(animeDate(anime.endDate));

    if (candidateTime === null) {
        return 0;
    }

    let score = 0;

    if (sourceIndex === 0 && startTime !== null) {
        const difference = daysBetween(candidateTime, startTime);
        score += difference === 0 ? 100 : difference <= 14 ? 35 : 0;
    }

    const expectedLength = Math.max(sourceLength, anime.episodes ?? sourceLength);

    if (sourceIndex === expectedLength - 1 && endTime !== null && candidateTime === endTime) {
        score += 60;
    }

    if (startTime !== null && endTime !== null) {
        if (candidateTime >= startTime && candidateTime <= endTime) {
            score += 20;
        } else if (
            candidateTime >= startTime - 31 * 24 * 60 * 60 * 1_000 &&
            candidateTime <= endTime + 370 * 24 * 60 * 60 * 1_000
        ) {
            score += 5;
        } else {
            score -= 20;
        }

        if (expectedLength > 1) {
            const progress = sourceIndex / (expectedLength - 1);
            const expected = startTime + (endTime - startTime) * progress;
            const difference = daysBetween(candidateTime, expected);

            score += difference <= 14 ? 35 : difference <= 60 ? 15 : difference <= 120 ? 5 : 0;
        }
    } else if (
        anime.startDate?.year &&
        Number(candidate.rawAirDate.slice(0, 4)) === anime.startDate.year
    ) {
        score += 10;
    }

    return score;
}

function pairScore(
    anime: AniListAnime,
    source: ProviderEpisode,
    sourceIndex: number,
    sourceLength: number,
    candidate: EpisodeCandidate,
    duplicateTitle: boolean
) {
    let score = -20;
    const title = episodeTitleScore(source.title, candidate.title);
    const date = dateScore(anime, sourceIndex, sourceLength, candidate);
    const titled = Boolean(episodeTitleKey(source.title));
    const specialNumber = source.number <= 0 || !Number.isInteger(source.number);
    const sameRegularNumber =
        Number.isInteger(source.number) &&
        source.number > 0 &&
        candidate.seasonNumber > 0 &&
        source.number === (candidate.releaseEpisodeNumber ?? candidate.episodeNumber);
    const specialRelease = isSpecialRelease(anime);
    const specialCandidate = specialRelease && candidate.seasonNumber === 0;
    const verifiedReleaseNumber =
        candidate.releaseEpisodeNumber !== undefined &&
        Number.isInteger(source.number) &&
        source.number > 0;

    if (verifiedReleaseNumber && source.number !== candidate.releaseEpisodeNumber) {
        return -Infinity;
    }

    if (specialRelease && candidate.seasonNumber > 0) {
        score -= 100;
    } else if (specialCandidate) {
        score += 100;
        if (animeTitles(anime).some((title) => episodeTitleScore(title, candidate.title) >= 60)) {
            score += 100;
        }
    }

    if (
        titled &&
        !duplicateTitle &&
        title < 15 &&
        !sameRegularNumber &&
        !verifiedReleaseNumber &&
        !specialCandidate &&
        date < 55
    ) {
        return -Infinity;
    }
    if (specialNumber && candidate.seasonNumber !== 0 && title < 60) {
        return -Infinity;
    }
    if (title >= 60 && date < 0 && !verifiedReleaseNumber) {
        return -Infinity;
    }

    score += title >= 0 ? title : -10;
    if (verifiedReleaseNumber) {
        score += 100;
    }

    if (Number.isInteger(source.number) && source.number > 0) {
        const difference = Math.abs(
            source.number - (candidate.releaseEpisodeNumber ?? candidate.episodeNumber)
        );

        if (difference === 0) {
            score += candidate.seasonNumber > 0 ? 25 : 8;
        } else if (difference === 1) {
            score += 5;
        }
    } else if (candidate.seasonNumber === 0) {
        score += 20;
    }

    if (anime.duration && candidate.runtime) {
        const difference = Math.abs(anime.duration - candidate.runtime);
        if (
            difference > 8 &&
            title < 60 &&
            !verifiedReleaseNumber &&
            !(sameRegularNumber && date >= 100)
        ) {
            return -Infinity;
        }

        score += difference <= 3 ? 20 : difference <= 8 ? 5 : -20;
    }

    return score + date;
}

function candidateOrder(left: EpisodeCandidate, right: EpisodeCandidate) {
    if (
        left.releaseEpisodeNumber !== undefined &&
        right.releaseEpisodeNumber !== undefined &&
        left.releaseEpisodeNumber !== right.releaseEpisodeNumber
    ) {
        return left.releaseEpisodeNumber - right.releaseEpisodeNumber;
    }

    if (left.rawAirDate && right.rawAirDate) {
        const date = left.rawAirDate.localeCompare(right.rawAirDate);
        if (date) {
            return date;
        }
    } else if (left.rawAirDate || right.rawAirDate) {
        return left.rawAirDate ? -1 : 1;
    }

    return left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber;
}

function releaseEpisodeNumber(candidate: EpisodeCandidate) {
    return candidate.releaseEpisodeNumber ?? candidate.episodeNumber;
}

function airingDay(airingAt: number | null | undefined) {
    if (!airingAt) {
        return null;
    }

    const date = new Date(airingAt * 1_000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function displayDate(timestamp: number) {
    const date = new Date(timestamp);
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function releaseScheduleMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    candidates: EpisodeCandidate[],
    matches: Map<number, number>
) {
    // TMDB may date terrestrial broadcasts while AniList and provider inventory follow an
    // earlier exclusive stream. Require a second matching schedule anchor before changing
    // the user-facing date, and retain rawAirDate as TMDB provenance.
    const firstSourceIndex = source.findIndex(({ number }) => number === 1);
    const firstCandidateIndex = matches.get(firstSourceIndex);
    const firstCandidate =
        firstCandidateIndex === undefined ? undefined : candidates[firstCandidateIndex];
    const start = dateTimestamp(animeDate(anime.startDate));
    const firstBroadcast = dateTimestamp(firstCandidate?.rawAirDate);

    if (
        !firstCandidate ||
        firstCandidate.seasonNumber <= 0 ||
        releaseEpisodeNumber(firstCandidate) !== 1 ||
        start === null ||
        firstBroadcast === null
    ) {
        return null;
    }

    const offset = firstBroadcast - start;
    if (offset < day || offset > maximumBroadcastDelay || offset % day !== 0) {
        return null;
    }

    const scheduledCandidate = (episode: number) =>
        candidates.find(
            (candidate) =>
                candidate.seasonNumber === firstCandidate.seasonNumber &&
                releaseEpisodeNumber(candidate) === episode
        );
    const confirmations: boolean[] = [];
    const expectedEpisodes = anime.episodes;
    const end = dateTimestamp(animeDate(anime.endDate));

    if (expectedEpisodes && end !== null) {
        const finale = dateTimestamp(scheduledCandidate(expectedEpisodes)?.rawAirDate);
        if (finale !== null) {
            confirmations.push(finale - end === offset);
        }
    }

    const nextEpisode = anime.nextAiringEpisode?.episode;
    const nextAiring = airingDay(anime.nextAiringEpisode?.airingAt);
    if (nextEpisode && nextAiring !== null) {
        const nextBroadcast = dateTimestamp(scheduledCandidate(nextEpisode)?.rawAirDate);
        if (nextBroadcast !== null) {
            confirmations.push(nextBroadcast - nextAiring === offset);
        }
    }

    if (!confirmations.length || confirmations.some((confirmed) => !confirmed)) {
        return null;
    }

    return {
        offset,
        seasonNumber: firstCandidate.seasonNumber,
    };
}

function matchedMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    candidates: EpisodeCandidate[],
    matches: Map<number, number>
) {
    const schedule = releaseScheduleMetadata(anime, source, candidates, matches);

    return new Map(
        [...matches.entries()].map(([sourceIndex, candidateIndex]) => {
            const candidate = candidates[candidateIndex];
            const broadcast = dateTimestamp(candidate.rawAirDate);
            const metadata =
                schedule && candidate.seasonNumber === schedule.seasonNumber && broadcast !== null
                    ? { ...candidate, airDate: displayDate(broadcast - schedule.offset) }
                    : candidate;

            return [source[sourceIndex].id, metadata];
        })
    );
}

function packagedShortMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    candidates: EpisodeCandidate[]
) {
    if (anime.format !== 'TV_SHORT') {
        return null;
    }

    const seasons = new Map<number, EpisodeCandidate[]>();
    for (const candidate of candidates) {
        if (candidate.seasonNumber <= 0) {
            continue;
        }

        const season = seasons.get(candidate.seasonNumber) ?? [];
        season.push(candidate);
        seasons.set(candidate.seasonNumber, season);
    }

    const start = animeDate(anime.startDate);
    const matches = [...seasons.values()]
        .filter((season) => season.length === source.length)
        .sort((left, right) => {
            const leftStart = left[0]?.rawAirDate ?? '';
            const rightStart = right[0]?.rawAirDate ?? '';
            return (
                Number(rightStart === start) - Number(leftStart === start) ||
                Number(rightStart.startsWith(String(anime.startDate?.year ?? ''))) -
                    Number(leftStart.startsWith(String(anime.startDate?.year ?? '')))
            );
        });
    const [season] = matches;

    return season ? new Map(source.map(({ id }, index) => [id, season[index]] as const)) : null;
}

export function matchEpisodeMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    available: EpisodeCandidate[]
): Map<string, EpisodeCandidate> {
    const candidates = available.toSorted(candidateOrder);
    const packaged = packagedShortMetadata(anime, source, candidates);
    if (packaged) {
        return packaged;
    }

    const titleCounts = new Map<string, number>();
    source.forEach(({ title }) => {
        const key = episodeTitleKey(title);
        if (key) {
            titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
        }
    });
    const duplicateTitle = (episode: ProviderEpisode) => {
        const key = episodeTitleKey(episode.title);
        return Boolean(key && (titleCounts.get(key) ?? 0) > 1);
    };
    const matches = new Map<number, number>();
    const usedCandidates = new Set<number>();
    const proposals = source.flatMap((episode, sourceIndex) =>
        candidates.flatMap((candidate, candidateIndex) => {
            const title = episodeTitleScore(episode.title, candidate.title);
            const score = pairScore(
                anime,
                episode,
                sourceIndex,
                source.length,
                candidate,
                duplicateTitle(episode)
            );
            const sameNumber =
                Number.isInteger(episode.number) &&
                episode.number > 0 &&
                episode.number === (candidate.releaseEpisodeNumber ?? candidate.episodeNumber);
            const titleCanEstablishIdentity =
                candidate.seasonNumber === 0 ||
                isSpecialEpisodeReference(episode) ||
                (sameNumber && !isSpecialRelease(anime));

            return titleCanEstablishIdentity && title >= 60 && Number.isFinite(score) && score >= 5
                ? [
                      {
                          sourceIndex,
                          candidateIndex,
                          score,
                      },
                  ]
                : [];
        })
    );

    proposals
        .sort(
            (left, right) =>
                right.score - left.score ||
                left.sourceIndex - right.sourceIndex ||
                left.candidateIndex - right.candidateIndex
        )
        .forEach(({ sourceIndex, candidateIndex }) => {
            if (!matches.has(sourceIndex) && !usedCandidates.has(candidateIndex)) {
                matches.set(sourceIndex, candidateIndex);
                usedCandidates.add(candidateIndex);
            }
        });

    const sourceIndexes = source.flatMap((_, index) => (matches.has(index) ? [] : [index]));
    const candidateIndexes = candidates.flatMap((_, index) =>
        usedCandidates.has(index) ? [] : [index]
    );
    const scores = Array.from({ length: sourceIndexes.length + 1 }, () =>
        Array<number>(candidateIndexes.length + 1).fill(0)
    );
    const operations = Array.from({ length: sourceIndexes.length + 1 }, () =>
        Array<'candidate' | 'episode' | 'match'>(candidateIndexes.length + 1)
    );

    for (let sourceOffset = 1; sourceOffset <= sourceIndexes.length; sourceOffset++) {
        for (
            let candidateOffset = 1;
            candidateOffset <= candidateIndexes.length;
            candidateOffset++
        ) {
            const sourceIndex = sourceIndexes[sourceOffset - 1];
            const candidateIndex = candidateIndexes[candidateOffset - 1];
            let best = scores[sourceOffset][candidateOffset - 1];
            let operation: 'candidate' | 'episode' | 'match' = 'candidate';

            if (scores[sourceOffset - 1][candidateOffset] > best) {
                best = scores[sourceOffset - 1][candidateOffset];
                operation = 'episode';
            }

            const paired = pairScore(
                anime,
                source[sourceIndex],
                sourceIndex,
                source.length,
                candidates[candidateIndex],
                duplicateTitle(source[sourceIndex])
            );
            const withPair = scores[sourceOffset - 1][candidateOffset - 1] + paired;

            if (paired >= 5 && withPair > best) {
                best = withPair;
                operation = 'match';
            }

            scores[sourceOffset][candidateOffset] = best;
            operations[sourceOffset][candidateOffset] = operation;
        }
    }

    let sourceOffset = sourceIndexes.length;
    let candidateOffset = candidateIndexes.length;

    while (sourceOffset > 0 && candidateOffset > 0) {
        const operation = operations[sourceOffset][candidateOffset];

        if (operation === 'match') {
            matches.set(sourceIndexes[sourceOffset - 1], candidateIndexes[candidateOffset - 1]);
            sourceOffset--;
            candidateOffset--;
        } else if (operation === 'episode') {
            sourceOffset--;
        } else {
            candidateOffset--;
        }
    }

    for (const sourceIndex of source.flatMap((_, index) => (matches.has(index) ? [] : [index]))) {
        const episode = source[sourceIndex];
        if (!Number.isInteger(episode.number) || episode.number <= 0) {
            continue;
        }
        if (!/^(?:episode|movie)(?:\s+\d+)?$/i.test(episode.title.trim())) {
            continue;
        }

        const ordinalCandidates = candidateIndexes.filter((candidateIndex) => {
            const candidate = candidates[candidateIndex];
            return (
                !usedCandidates.has(candidateIndex) &&
                candidate.seasonNumber > 0 &&
                (candidate.releaseEpisodeNumber ?? candidate.episodeNumber) === episode.number &&
                /^(?:episode|movie)(?:\s+\d+)?$/i.test(candidate.title.trim())
            );
        });
        if (ordinalCandidates.length !== 1) {
            continue;
        }

        const [candidateIndex] = ordinalCandidates;
        matches.set(sourceIndex, candidateIndex);
        usedCandidates.add(candidateIndex);
    }

    return matchedMetadata(anime, source, candidates, matches);
}

export function matchBestEpisodeMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    focused: EpisodeCandidate[] | null,
    available: EpisodeCandidate[]
) {
    const availableMatches = matchEpisodeMetadata(anime, source, available);
    if (!focused) {
        return availableMatches;
    }

    const focusedByProviderNumber = new Map(
        focused.map((candidate) => [candidate.episodeNumber, candidate] as const)
    );
    const focusedStartsAtRelease = focused[0]?.rawAirDate === animeDate(anime.startDate);
    const providerNumberMatches = source.flatMap((episode) => {
        const candidate = focusedByProviderNumber.get(episode.number);
        return candidate ? [{ id: episode.id, candidate }] : [];
    });
    if (focusedStartsAtRelease && providerNumberMatches.length === focused.length) {
        return new Map(providerNumberMatches.map(({ id, candidate }) => [id, candidate]));
    }

    const focusedMatches = matchEpisodeMetadata(anime, source, focused);
    return focusedStartsAtRelease && focusedMatches.size > 0 ? focusedMatches : availableMatches;
}

/** Selects the current release from a provider inventory that includes its predecessor. */
export function providerReleaseWindow(anime: AniListAnime, source: ProviderEpisode[]) {
    const expected = anime.episodes;
    if (!expected || expected <= 0 || source.length <= expected) {
        return source;
    }

    const predecessorEpisodes = (anime.relations?.edges ?? []).flatMap((edge) =>
        edge?.relationType === 'PREQUEL' && edge.node?.type === 'ANIME' && edge.node.episodes
            ? [edge.node.episodes]
            : []
    );
    const start = Math.max(0, ...predecessorEpisodes);
    if (!start) {
        return source;
    }

    const offset = Math.min(start, source.length - expected);
    return source.slice(offset, offset + expected).map((episode, index) => ({
        ...episode,
        number: index + 1,
    }));
}
