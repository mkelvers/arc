import type { Episode as AllAnimeEpisode } from '../allanime/types';
import { create, imageUrl } from './client';
import { resolveStored } from './mapping';
import { normalizeTitle } from './title';
import type {
    AniListAnime,
    EpisodeCandidate,
    EpisodeMetadata,
} from './types';

function animeStartDate(anime: AniListAnime) {
    const { year, month, day } = anime.startDate ?? {};

    return year && month && day
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
}

function displayAirDate(value: string | undefined) {
    const [year, month, day] = (value ?? '').split('-');
    return year && month && day ? `${month}/${day}/${year}` : '';
}

function episodeTitle(value: string) {
    return normalizeTitle(value).replace(/^episode\s+\d+\s*/, '');
}

function titleScore(left: string, right: string) {
    const a = episodeTitle(left);
    const b = episodeTitle(right);

    if (!a || !b) {
        return 0;
    }

    if (a === b) {
        return 25;
    }

    return a.includes(b) || b.includes(a) ? 12 : -8;
}

function largestNumber(source: AllAnimeEpisode[]) {
    return Math.max(
        0,
        ...source
            .filter(({ number }) => Number.isInteger(number))
            .map(({ number }) => number),
    );
}

function seasonScore(
    season: {
        air_date?: string;
        episode_count: number;
        season_number: number;
    },
    expectedCount: number,
    largestSourceNumber: number,
    startDate: string | null,
    startYear: number | null,
) {
    let score = 0;
    const seasonYear = Number(season.air_date?.slice(0, 4)) || null;

    if (expectedCount > 0 && season.episode_count === expectedCount) {
        score += 80;
    }

    if (season.episode_count >= largestSourceNumber) {
        score += 10;
    }

    if (startDate && season.air_date === startDate) {
        score += 80;
    } else if (startYear && seasonYear === startYear) {
        score += 30;
    } else if (startYear && seasonYear) {
        score -= Math.abs(startYear - seasonYear) * 8;
    }

    return score;
}

function sequenceScore(
    sequence: EpisodeCandidate[],
    start: number,
    source: AllAnimeEpisode[],
    expectedCount: number,
    startDate: string | null,
    startYear: number | null,
    baseScore: number,
) {
    const largestSourceNumber = largestNumber(source);
    if (sequence.length - start < largestSourceNumber) {
        return -Infinity;
    }

    let score = baseScore + 20;
    const first = sequence[start];
    const firstYear = Number(first?.rawAirDate.slice(0, 4)) || null;

    if (startDate && first?.rawAirDate === startDate) {
        score += 120;
    } else if (startYear && firstYear === startYear) {
        score += 35;
    }

    if (expectedCount > 0 && sequence.length - start === expectedCount) {
        score += 30;
    }

    for (const episode of source.slice(0, 4)) {
        if (!Number.isInteger(episode.number) || episode.number < 1) {
            continue;
        }

        const media = sequence[start + episode.number - 1];
        if (media) {
            score += titleScore(episode.title, media.title);
        }
    }

    return score;
}

function candidateStarts(
    sequence: EpisodeCandidate[],
    source: AllAnimeEpisode[],
    startDate: string | null,
) {
    const starts = new Set([0]);

    sequence.forEach((episode, index) => {
        if (startDate && episode.rawAirDate === startDate) {
            starts.add(index);
        }

        if (
            source[0]?.title &&
            titleScore(source[0].title, episode.title) >= 25
        ) {
            starts.add(index);
        }
    });

    return [...starts];
}

export async function getEpisodeMetadata(
    anime: AniListAnime,
    source: AllAnimeEpisode[],
): Promise<Map<string, EpisodeMetadata>> {
    const match = await resolveStored(anime);

    if (match.mediaType !== 'tv' || !source.length) {
        return new Map();
    }

    const client = create();
    const { data: series, error } = await client.GET(
        '/3/tv/{series_id}',
        {
            params: {
                path: { series_id: match.id },
                query: { language: 'en-US' },
            },
        },
    );

    if (!series) {
        throw new Error('TMDB series request failed', { cause: error });
    }

    const special = anime.format === 'OVA' || anime.format === 'SPECIAL';
    const seasons = (series.seasons ?? []).filter(({ season_number }) =>
        special ? season_number === 0 : season_number > 0,
    );
    const largestSourceNumber = largestNumber(source);
    const expectedCount = anime.episodes ?? largestSourceNumber;
    const startDate = animeStartDate(anime);
    const startYear = anime.startDate?.year ?? anime.seasonYear ?? null;
    const largestSeason = Math.max(
        0,
        ...seasons.map(({ episode_count }) => episode_count),
    );
    const ranked = seasons
        .map((season) => ({
            season,
            score: seasonScore(
                season,
                expectedCount,
                largestSourceNumber,
                startDate,
                startYear,
            ),
        }))
        .sort((left, right) => right.score - left.score);
    const selected =
        expectedCount > largestSeason ? ranked : ranked.slice(0, 4);
    const fetched = await Promise.all(
        selected.map(async ({ season, score }) => {
            const response = await client.GET(
                '/3/tv/{series_id}/season/{season_number}',
                {
                    params: {
                        path: {
                            series_id: match.id,
                            season_number: season.season_number,
                        },
                        query: { language: 'en-US' },
                    },
                },
            );

            if (!response.data) {
                return { episodes: [], score };
            }

            return {
                score,
                episodes: (response.data.episodes ?? []).map(
                    (episode) => ({
                        episodeNumber: episode.episode_number,
                        seasonNumber: episode.season_number,
                        title: episode.name?.trim() ?? '',
                        overview: episode.overview?.trim() ?? '',
                        imageUrl: episode.still_path
                            ? imageUrl(episode.still_path, 'w500')
                            : null,
                        runtime: episode.runtime || null,
                        rawAirDate: episode.air_date ?? '',
                        airDate: displayAirDate(episode.air_date),
                    }),
                ),
            };
        }),
    );
    const sequences = fetched.flatMap(({ episodes, score }) =>
        episodes.length ? [{ episodes, score }] : [],
    );

    if (fetched.length > 1) {
        const combined = fetched
            .flatMap(({ episodes }) => episodes)
            .sort(
                (left, right) =>
                    left.rawAirDate.localeCompare(right.rawAirDate) ||
                    left.seasonNumber - right.seasonNumber ||
                    left.episodeNumber - right.episodeNumber,
            );
        sequences.push({ episodes: combined, score: 0 });
    }

    let best:
        | { sequence: EpisodeCandidate[]; start: number; score: number }
        | undefined;

    for (const candidate of sequences) {
        for (const start of candidateStarts(
            candidate.episodes,
            source,
            startDate,
        )) {
            const score = sequenceScore(
                candidate.episodes,
                start,
                source,
                expectedCount,
                startDate,
                startYear,
                candidate.score,
            );

            if (!best || score > best.score) {
                best = {
                    sequence: candidate.episodes,
                    start,
                    score,
                };
            }
        }
    }

    if (!best || best.score < 60) {
        return new Map();
    }

    return new Map(
        source.flatMap((episode) => {
            if (!Number.isInteger(episode.number) || episode.number < 1) {
                return [];
            }

            const media =
                best.sequence[best.start + episode.number - 1];

            return media ? [[episode.id, media] as const] : [];
        }),
    );
}
