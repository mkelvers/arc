import type { ProviderEpisode } from '../providers/types';
import {
    episodeTitleKey,
    episodeTitleScore,
    isSpecialEpisodeReference,
} from '../providers/match';
import { isSpecialRelease, titlesFor } from './title';
import type {
    AniListAnime,
    EpisodeCandidate,
} from './types';

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
    const { year, month, day } = value ?? {};

    return year && month && day
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
}

function dateTime(value: string | null) {
    if (!value) {
        return null;
    }

    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function daysBetween(left: number, right: number) {
    return Math.abs(left - right) / (24 * 60 * 60 * 1_000);
}

function dateScore(
    anime: AniListAnime,
    sourceIndex: number,
    sourceLength: number,
    candidate: EpisodeCandidate,
) {
    const candidateTime = dateTime(candidate.rawAirDate);
    const startTime = dateTime(animeDate(anime.startDate));
    const endTime = dateTime(animeDate(anime.endDate));

    if (candidateTime === null) {
        return 0;
    }

    let score = 0;

    if (sourceIndex === 0 && startTime !== null) {
        const difference = daysBetween(candidateTime, startTime);
        score += difference === 0 ? 100 : difference <= 14 ? 35 : 0;
    }

    const expectedLength = Math.max(
        sourceLength,
        anime.episodes ?? sourceLength,
    );

    if (
        sourceIndex === expectedLength - 1 &&
        endTime !== null &&
        candidateTime === endTime
    ) {
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
            const expected =
                startTime + (endTime - startTime) * progress;
            const difference = daysBetween(candidateTime, expected);

            score +=
                difference <= 14
                    ? 35
                    : difference <= 60
                      ? 15
                      : difference <= 120
                        ? 5
                        : 0;
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
    duplicateTitle: boolean,
) {
    let score = -20;
    const title = episodeTitleScore(source.title, candidate.title);
    const date = dateScore(
        anime,
        sourceIndex,
        sourceLength,
        candidate,
    );
    const titled = Boolean(episodeTitleKey(source.title));
    const specialNumber =
        source.number <= 0 || !Number.isInteger(source.number);
    const sameRegularNumber =
        Number.isInteger(source.number) &&
        source.number > 0 &&
        candidate.seasonNumber > 0 &&
        source.number ===
            (candidate.releaseEpisodeNumber ??
                candidate.episodeNumber);
    const specialRelease = isSpecialRelease(anime);
    const specialCandidate =
        specialRelease && candidate.seasonNumber === 0;

    if (specialRelease && candidate.seasonNumber > 0) {
        score -= 100;
    } else if (specialCandidate) {
        score += 100;
        if (
            titlesFor(anime).some(
                (title) =>
                    episodeTitleScore(title, candidate.title) >= 60,
            )
        ) {
            score += 100;
        }
    }

    if (
        titled &&
        !duplicateTitle &&
        title < 15 &&
        !sameRegularNumber &&
        !specialCandidate &&
        date < 55
    ) {
        return -Infinity;
    }
    if (
        specialNumber &&
        candidate.seasonNumber !== 0 &&
        title < 60
    ) {
        return -Infinity;
    }
    if (title >= 60 && date < 0) {
        return -Infinity;
    }

    score += title >= 0 ? title : -10;

    if (Number.isInteger(source.number) && source.number > 0) {
        const difference = Math.abs(
            source.number -
                (candidate.releaseEpisodeNumber ??
                    candidate.episodeNumber),
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
        if (difference > 8 && title < 60) {
            return -Infinity;
        }

        score += difference <= 3 ? 20 : difference <= 8 ? 5 : -20;
    }

    return score + date;
}

function candidateOrder(
    left: EpisodeCandidate,
    right: EpisodeCandidate,
) {
    if (left.rawAirDate && right.rawAirDate) {
        const date = left.rawAirDate.localeCompare(right.rawAirDate);
        if (date) {
            return date;
        }
    } else if (left.rawAirDate || right.rawAirDate) {
        return left.rawAirDate ? -1 : 1;
    }

    return (
        left.seasonNumber - right.seasonNumber ||
        left.episodeNumber - right.episodeNumber
    );
}

export function matchEpisodeMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    available: EpisodeCandidate[],
): Map<string, EpisodeCandidate> {
    const candidates = available.toSorted(candidateOrder);
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
            const title = episodeTitleScore(
                episode.title,
                candidate.title,
            );
            const score = pairScore(
                anime,
                episode,
                sourceIndex,
                source.length,
                candidate,
                duplicateTitle(episode),
            );
            const sameNumber =
                Number.isInteger(episode.number) &&
                episode.number > 0 &&
                episode.number ===
                    (candidate.releaseEpisodeNumber ??
                        candidate.episodeNumber);
            const titleCanEstablishIdentity =
                candidate.seasonNumber === 0 ||
                isSpecialEpisodeReference(episode) ||
                (sameNumber && !isSpecialRelease(anime));

            return titleCanEstablishIdentity &&
                title >= 60 &&
                Number.isFinite(score) &&
                score >= 5
                ? [
                      {
                          sourceIndex,
                          candidateIndex,
                          score,
                      },
                  ]
                : [];
        }),
    );

    proposals
        .sort(
            (left, right) =>
                right.score - left.score ||
                left.sourceIndex - right.sourceIndex ||
                left.candidateIndex - right.candidateIndex,
        )
        .forEach(({ sourceIndex, candidateIndex }) => {
            if (
                !matches.has(sourceIndex) &&
                !usedCandidates.has(candidateIndex)
            ) {
                matches.set(sourceIndex, candidateIndex);
                usedCandidates.add(candidateIndex);
            }
        });

    const sourceIndexes = source.flatMap((_, index) =>
        matches.has(index) ? [] : [index],
    );
    const candidateIndexes = candidates.flatMap((_, index) =>
        usedCandidates.has(index) ? [] : [index],
    );
    const scores = Array.from({ length: sourceIndexes.length + 1 }, () =>
        Array<number>(candidateIndexes.length + 1).fill(0),
    );
    const operations = Array.from(
        { length: sourceIndexes.length + 1 },
        () => Array<'candidate' | 'episode' | 'match'>(
            candidateIndexes.length + 1,
        ),
    );

    for (
        let sourceOffset = 1;
        sourceOffset <= sourceIndexes.length;
        sourceOffset++
    ) {
        for (
            let candidateOffset = 1;
            candidateOffset <= candidateIndexes.length;
            candidateOffset++
        ) {
            const sourceIndex = sourceIndexes[sourceOffset - 1];
            const candidateIndex =
                candidateIndexes[candidateOffset - 1];
            let best = scores[sourceOffset][candidateOffset - 1];
            let operation: 'candidate' | 'episode' | 'match' =
                'candidate';

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
                duplicateTitle(source[sourceIndex]),
            );
            const withPair =
                scores[sourceOffset - 1][candidateOffset - 1] + paired;

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
            matches.set(
                sourceIndexes[sourceOffset - 1],
                candidateIndexes[candidateOffset - 1],
            );
            sourceOffset--;
            candidateOffset--;
        } else if (operation === 'episode') {
            sourceOffset--;
        } else {
            candidateOffset--;
        }
    }

    return new Map(
        [...matches.entries()].map(([sourceIndex, candidateIndex]) => [
            source[sourceIndex].id,
            candidates[candidateIndex],
        ]),
    );
}

export function matchBestEpisodeMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    focused: EpisodeCandidate[] | null,
    available: EpisodeCandidate[],
) {
    const availableMatches = matchEpisodeMetadata(
        anime,
        source,
        available,
    );
    if (!focused) {
        return availableMatches;
    }

    const focusedMatches = matchEpisodeMetadata(anime, source, focused);
    return focusedMatches.size >= availableMatches.size
        ? focusedMatches
        : availableMatches;
}
