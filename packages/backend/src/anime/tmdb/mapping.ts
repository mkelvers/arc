import { animeTitles } from '../anilist/text';
import type { AniListAnime } from '../anilist/types';
import { animeDate } from '../date';
import { logger } from '@arc/backend/internal/logger';
import { episodeTitleKey } from '../providers/match';
import { create } from './client';
import {
    preferredTvReleaseCandidate,
    relatedSpecialMappingIsBetter,
    specialEpisodeEvidenceScore,
    type SpecialEpisodeEvidence,
    type TvSeasonEvidence,
} from './mapping-evidence';
import { findMapping, saveVerifiedMapping } from './mapping-store';
import { mappingNeedsVerification } from './mapping-verification';
import {
    alternateCandidateIsBetter,
    candidateMatchesPrimaryTitle,
    candidateScore,
    isSpecialRelease,
    mappingTitles,
    releaseSequence,
    seriesTitle,
} from './title';
import { type Candidate, type Mapping, type StoredMapping } from './types';

const tvEvidenceCandidateLimit = 6;

interface RankedCandidate {
    candidate: Candidate;
    searchRank: number;
}

export class NoConfidentTmdbMappingError extends Error {
    constructor(readonly anilistId: number) {
        super(`No confident TMDB match for AniList ${anilistId}`);
    }
}

function seasonEvidenceScore(
    anime: AniListAnime,
    season: {
        air_date?: string;
        episode_count: number;
        season_number: number;
    }
) {
    let score = season.season_number === 0 ? 100 : 0;

    if (anime.episodes && season.episode_count === anime.episodes) {
        score += 80;
    }

    const animeYear = anime.startDate?.year ?? anime.seasonYear;
    if (animeYear && Number(season.air_date?.slice(0, 4)) === animeYear) {
        score += 30;
    }

    return score;
}

async function specialMappingEvidence(anime: AniListAnime, mapping: Mapping) {
    try {
        const client = create();
        if (mapping.mediaType === 'movie') {
            const { data: movie } = await client.GET('/3/movie/{movie_id}', {
                params: {
                    path: { movie_id: mapping.id },
                    query: { language: 'en-US' },
                },
            });

            return movie
                ? specialEpisodeEvidenceScore(anime, [
                      {
                          airDate: movie.release_date ?? '',
                          name: movie.title?.trim() || movie.original_title?.trim() || '',
                          overview: movie.overview?.trim() ?? '',
                          runtime: movie.runtime || null,
                          seasonNumber: 0,
                          stillPath: movie.backdrop_path ?? movie.poster_path ?? null,
                      },
                  ])
                : null;
        }

        const { data: series } = await client.GET('/3/tv/{series_id}', {
            params: {
                path: { series_id: mapping.id },
                query: { language: 'en-US' },
            },
        });

        if (!series) {
            return null;
        }

        const selected = (series.seasons ?? [])
            .map((season) => ({
                score: seasonEvidenceScore(anime, season),
                season,
            }))
            .sort((left, right) => right.score - left.score)
            .slice(0, 3);
        const episodes = await Promise.all(
            selected.map(async ({ season }) => {
                const { data } = await client.GET('/3/tv/{series_id}/season/{season_number}', {
                    params: {
                        path: {
                            series_id: mapping.id,
                            season_number: season.season_number,
                        },
                        query: { language: 'en-US' },
                    },
                });

                return (data?.episodes ?? []).map((episode): SpecialEpisodeEvidence => ({
                    airDate: episode.air_date ?? '',
                    name: episode.name?.trim() ?? '',
                    overview: episode.overview?.trim() ?? '',
                    runtime: episode.runtime || null,
                    seasonNumber: episode.season_number,
                    stillPath: episode.still_path ?? null,
                }));
            })
        );

        return specialEpisodeEvidenceScore(anime, episodes.flat());
    } catch {
        return null;
    }
}

async function preferredSpecialMapping(
    anime: AniListAnime,
    direct: Mapping,
    related: StoredMapping[]
) {
    if (
        !isSpecialRelease(anime) ||
        related.length !== 1 ||
        (direct.id === related[0].id && direct.mediaType === related[0].mediaType)
    ) {
        return direct;
    }

    const relatedMapping = {
        id: related[0].id,
        mediaType: related[0].mediaType,
    };
    const [directScore, relatedScore] = await Promise.all([
        specialMappingEvidence(anime, direct),
        specialMappingEvidence(anime, relatedMapping),
    ]);

    return relatedSpecialMappingIsBetter(directScore, relatedScore) ? relatedMapping : direct;
}

async function preferredTvMapping(
    anime: AniListAnime,
    direct: Candidate,
    candidates: RankedCandidate[]
) {
    if (anime.format !== 'TV' || direct.mediaType !== 'tv' || !anime.episodes) {
        return direct;
    }

    const client = create();
    const directSeries = await client
        .GET('/3/tv/{series_id}', {
            params: {
                path: { series_id: direct.id },
                query: { language: 'en-US' },
            },
        })
        .then(({ data }) => data)
        .catch(() => undefined);
    if (!directSeries) {
        return direct;
    }

    const alternatives = candidates
        .filter(({ candidate }) => candidate.mediaType === 'tv' && candidate.id !== direct.id)
        .sort(
            (left, right) =>
                left.searchRank - right.searchRank ||
                candidateScore(right.candidate, anime) - candidateScore(left.candidate, anime)
        )
        .slice(0, tvEvidenceCandidateLimit - 1)
        .map(({ candidate }) => candidate);
    const expectedStart = animeDate(anime.startDate);
    const expectedEnd = animeDate(anime.endDate);
    const expectedSequence = releaseSequence(anime);
    const candidateEvidence = async (
        candidate: Candidate,
        series: typeof directSeries | undefined = undefined
    ) => {
        try {
            const data =
                series ??
                (
                    await client.GET('/3/tv/{series_id}', {
                        params: {
                            path: { series_id: candidate.id },
                            query: { language: 'en-US' },
                        },
                    })
                ).data;
            if (!data) {
                return null;
            }

            const seasons = (data.seasons ?? [])
                .filter(({ season_number }) => season_number > 0)
                .map((season) => ({
                    season,
                    score:
                        seasonEvidenceScore(anime, season) +
                        Number(expectedSequence === season.season_number) * 60,
                }))
                .sort((left, right) => right.score - left.score)
                .slice(0, 3);
            const details = await Promise.all(
                seasons.map(({ season }) =>
                    client
                        .GET('/3/tv/{series_id}/season/{season_number}', {
                            params: {
                                path: {
                                    series_id: candidate.id,
                                    season_number: season.season_number,
                                },
                                query: { language: 'en-US' },
                            },
                        })
                        .then(({ data }) => data)
                        .catch(() => undefined)
                )
            );
            const detailBySeason = new Map(
                details.flatMap((season) =>
                    season?.season_number === undefined ? [] : [[season.season_number, season]]
                )
            );

            return {
                candidate,
                seasons: (data.seasons ?? []).map((season): TvSeasonEvidence => {
                    const episodes = detailBySeason.get(season.season_number)?.episodes ?? [];
                    const release =
                        expectedStart && expectedEnd
                            ? episodes.filter(({ air_date }) => {
                                  const date = air_date ?? '';
                                  return date >= expectedStart && date <= expectedEnd;
                              })
                            : [];

                    return {
                        airDate: season.air_date ?? null,
                        episodeCount: season.episode_count,
                        metadataCount: release.filter(
                            ({ name, overview }) =>
                                Boolean(episodeTitleKey(name ?? '')) && Boolean(overview?.trim())
                        ).length,
                        name: season.name?.trim() ?? '',
                        releaseAirDate: release[0]?.air_date ?? null,
                        releaseEpisodeCount: release.length,
                        seasonNumber: season.season_number,
                    };
                }),
            };
        } catch {
            return null;
        }
    };
    const evidence = await Promise.all([
        candidateEvidence(direct, directSeries),
        ...alternatives.map((candidate) => candidateEvidence(candidate)),
    ]);

    return preferredTvReleaseCandidate(
        anime,
        direct,
        evidence.filter((entry) => entry !== null)
    );
}

async function searchTv(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/tv', {
        params: { query: { query, include_adult: true } },
    });

    if (!data) {
        throw new Error('TMDB TV search failed', { cause: error });
    }

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'tv' as const,
                      name: result.name ?? '',
                      originalName: result.original_name ?? '',
                      date: result.first_air_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : []
    );
}

async function searchMovies(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/movie', {
        params: { query: { query, include_adult: true } },
    });

    if (!data) {
        throw new Error('TMDB movie search failed', { cause: error });
    }

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'movie' as const,
                      name: result.title ?? '',
                      originalName: result.original_title ?? '',
                      date: result.release_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : []
    );
}

async function discoverMapping(anime: AniListAnime): Promise<StoredMapping> {
    const relatedMappings = (
        await Promise.all(
            (anime.relations?.edges ?? []).flatMap((edge) =>
                edge?.node?.type === 'ANIME' &&
                (edge.relationType === 'PREQUEL' ||
                    edge.relationType === 'SEQUEL' ||
                    (isSpecialRelease(anime) && edge.relationType === 'PARENT'))
                    ? [findMapping(edge.node.id)]
                    : []
            )
        )
    ).filter((mapping): mapping is StoredMapping => mapping !== null);
    const related = [
        ...new Map(
            relatedMappings.map((mapping) => [`${mapping.mediaType}:${mapping.id}`, mapping])
        ).values(),
    ];
    const titles = mappingTitles(anime);

    if (!titles.length) {
        throw new Error('AniList returned no searchable title');
    }

    const queries = [...new Set(titles.flatMap((title) => [title, seriesTitle(title)]))];
    const preferredSearch = anime.format === 'MOVIE' ? searchMovies : searchTv;
    const alternateSearch = anime.format === 'MOVIE' ? searchTv : searchMovies;
    const findCandidate = async (search: typeof searchTv | typeof searchMovies) => {
        const results = await Promise.all(queries.map((title) => search(title)));
        const unique = new Map<string, RankedCandidate>();
        results.forEach((candidates) => {
            candidates.forEach((candidate, searchRank) => {
                const key = `${candidate.mediaType}:${candidate.id}`;
                const existing = unique.get(key);
                if (!existing || searchRank < existing.searchRank) {
                    unique.set(key, { candidate, searchRank });
                }
            });
        });
        const candidates = [...unique.values()];
        const match = candidates
            .map(({ candidate }) => candidate)
            .sort((left, right) => candidateScore(right, anime) - candidateScore(left, anime))[0];

        return { candidates, match };
    };
    let search = await findCandidate(preferredSearch);
    const preferred = search.match;

    if (
        !preferred ||
        candidateScore(preferred, anime) < 85 ||
        !candidateMatchesPrimaryTitle(preferred, anime)
    ) {
        const alternate = await findCandidate(alternateSearch);
        if (
            alternate.match &&
            (!preferred || alternateCandidateIsBetter(anime, preferred, alternate.match))
        ) {
            search = alternate;
        }
    }

    // Missing enrichment is safer than attaching art and episodes from a
    // similarly named release, so only persist a confident search result.
    if (search.match && candidateScore(search.match, anime) >= 85) {
        const releaseMatch = await preferredTvMapping(anime, search.match, search.candidates);
        const mapping = await preferredSpecialMapping(
            anime,
            {
                id: releaseMatch.id,
                mediaType: releaseMatch.mediaType,
            },
            related
        );

        return saveVerifiedMapping(anime, {
            id: mapping.id,
            mediaType: mapping.mediaType,
        });
    }

    if (related.length === 1) {
        return saveVerifiedMapping(anime, {
            id: related[0].id,
            mediaType: related[0].mediaType,
        });
    }

    throw new NoConfidentTmdbMappingError(anime.id);
}

async function refreshStoredMapping(
    anime: AniListAnime,
    stored: StoredMapping | null
): Promise<StoredMapping> {
    const title = animeTitles(anime)[0] ?? null;

    try {
        return await discoverMapping(anime);
    } catch (cause) {
        if (stored && stored.title === title) {
            logger.debug(
                `TMDB mapping revalidation failed for AniList ${anime.id}; using the last verified mapping`,
                cause
            );
            return stored;
        }

        throw cause;
    }
}

export async function resolveStored(
    anime: AniListAnime,
    options: { refresh?: boolean } = {}
): Promise<StoredMapping> {
    const stored = await findMapping(anime.id);
    const title = animeTitles(anime)[0] ?? null;
    if (stored && (!options.refresh || !mappingNeedsVerification(stored, title))) {
        return stored;
    }

    if (!options.refresh) {
        throw new NoConfidentTmdbMappingError(anime.id);
    }

    if (stored) {
        return stored;
    }

    return refreshStoredMapping(anime, stored);
}
