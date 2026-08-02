import { create } from './client';
import {
    relatedSpecialMappingIsBetter,
    specialEpisodeEvidenceScore,
    type SpecialEpisodeEvidence,
} from './mapping-evidence';
import {
    findMapping,
    saveVerifiedMapping,
} from './mapping-store';
import { mappingNeedsVerification } from './mapping-verification';
import {
    candidateScore,
    isSpecialRelease,
    mappingTitles,
    seriesTitle,
    titlesFor,
} from './title';
import {
    type AniListAnime,
    type Candidate,
    type Mapping,
    type StoredMapping,
} from './types';

const requests = new Map<number, Promise<StoredMapping>>();

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
    },
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
            const { data: movie } = await client.GET(
                '/3/movie/{movie_id}',
                {
                    params: {
                        path: { movie_id: mapping.id },
                        query: { language: 'en-US' },
                    },
                },
            );

            return movie
                ? specialEpisodeEvidenceScore(anime, [
                      {
                          airDate: movie.release_date ?? '',
                          name:
                              movie.title?.trim() ||
                              movie.original_title?.trim() ||
                              '',
                          overview: movie.overview?.trim() ?? '',
                          runtime: movie.runtime || null,
                          seasonNumber: 0,
                          stillPath:
                              movie.backdrop_path ??
                              movie.poster_path ??
                              null,
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
                const { data } = await client.GET(
                    '/3/tv/{series_id}/season/{season_number}',
                    {
                        params: {
                            path: {
                                series_id: mapping.id,
                                season_number: season.season_number,
                            },
                            query: { language: 'en-US' },
                        },
                    },
                );

                return (data?.episodes ?? []).map(
                    (episode): SpecialEpisodeEvidence => ({
                        airDate: episode.air_date ?? '',
                        name: episode.name?.trim() ?? '',
                        overview: episode.overview?.trim() ?? '',
                        runtime: episode.runtime || null,
                        seasonNumber: episode.season_number,
                        stillPath: episode.still_path ?? null,
                    }),
                );
            }),
        );

        return specialEpisodeEvidenceScore(anime, episodes.flat());
    } catch {
        return null;
    }
}

async function preferredSpecialMapping(
    anime: AniListAnime,
    direct: Mapping,
    related: StoredMapping[],
) {
    if (
        !isSpecialRelease(anime) ||
        related.length !== 1 ||
        (direct.id === related[0].id &&
            direct.mediaType === related[0].mediaType)
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

    return relatedSpecialMappingIsBetter(directScore, relatedScore)
        ? relatedMapping
        : direct;
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
            : [],
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
            : [],
    );
}

async function discoverMapping(
    anime: AniListAnime,
): Promise<StoredMapping> {
    const relatedMappings = (
        await Promise.all(
            (anime.relations?.edges ?? []).flatMap((edge) =>
                edge?.node?.type === 'ANIME' &&
                (edge.relationType === 'PREQUEL' ||
                    edge.relationType === 'SEQUEL' ||
                    (isSpecialRelease(anime) &&
                        edge.relationType === 'PARENT'))
                    ? [findMapping(edge.node.id)]
                    : [],
            ),
        )
    ).filter((mapping): mapping is StoredMapping => mapping !== null);
    const related = [
        ...new Map(
            relatedMappings.map((mapping) => [
                `${mapping.mediaType}:${mapping.id}`,
                mapping,
            ]),
        ).values(),
    ];
    const titles = mappingTitles(anime);

    if (!titles.length) {
        throw new Error('AniList returned no searchable title');
    }

    const queries = [
        ...new Set(titles.flatMap((title) => [title, seriesTitle(title)])),
    ];
    const preferredSearch =
        anime.format === 'MOVIE' ? searchMovies : searchTv;
    const alternateSearch =
        anime.format === 'MOVIE' ? searchTv : searchMovies;
    const findCandidate = async (
        search: typeof searchTv | typeof searchMovies,
    ) => {
        const candidates = (
            await Promise.all(queries.map((title) => search(title)))
        ).flat();
        const unique = [
            ...new Map(
                candidates.map((candidate) => [
                    `${candidate.mediaType}:${candidate.id}`,
                    candidate,
                ]),
            ).values(),
        ];

        return unique.sort(
            (left, right) =>
                candidateScore(right, anime) -
                candidateScore(left, anime),
        )[0];
    };
    let match = await findCandidate(preferredSearch);

    if (!match || candidateScore(match, anime) < 85) {
        match = await findCandidate(alternateSearch);
    }

    // Missing enrichment is safer than attaching art and episodes from a
    // similarly named release, so only persist a confident search result.
    if (match && candidateScore(match, anime) >= 85) {
        const mapping = await preferredSpecialMapping(
            anime,
            {
                id: match.id,
                mediaType: match.mediaType,
            },
            related,
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

async function resolveStoredUncached(
    anime: AniListAnime,
): Promise<StoredMapping> {
    const stored = await findMapping(anime.id);
    const title = titlesFor(anime)[0] ?? null;

    if (stored && !mappingNeedsVerification(stored, title)) {
        return stored;
    }

    try {
        return await discoverMapping(anime);
    } catch (cause) {
        if (stored && stored.title === title) {
            console.error(
                `TMDB mapping revalidation failed for AniList ${anime.id}; using the last verified mapping`,
                cause,
            );
            return stored;
        }

        throw cause;
    }
}

export async function resolveStored(
    anime: AniListAnime,
): Promise<StoredMapping> {
    const pending = requests.get(anime.id);
    if (pending) {
        return pending;
    }

    const request = resolveStoredUncached(anime);
    requests.set(anime.id, request);

    try {
        return await request;
    } finally {
        requests.delete(anime.id);
    }
}

export async function resolve(anime: AniListAnime): Promise<Mapping> {
    const { id, mediaType } = await resolveStored(anime);

    return { id, mediaType };
}
