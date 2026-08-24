import type { AniListAnime } from '../anilist/types';
import { z } from 'zod';
import { animeDate } from '../date';
import type { ProviderEpisode } from '../providers/types';
import type { JsonValue } from '#utils';
import { create, imageUrl } from './client';
import { getEpisodeChanges } from './episode-changes';
import {
    completeEpisodeDetails,
    episodeDetailsNeeded,
    hasRequestedEpisodeLocalization,
    translatedMetadata,
} from './episode-details';
import {
    releaseEpisodeGroup,
    releaseWindowEpisodeGroup,
    type EpisodeGroupBlock,
} from './episode-groups';
import { matchBestEpisodeMetadata } from './episode-match';
import { movieEpisodeMetadata } from './movie-episodes';
import { resolveStored } from './mapping';
import { releaseSequence } from './title';
import type { EpisodeCandidate, EpisodeMetadata, StoredEpisodeText, StoredMapping } from './types';

interface MetadataEntry {
    id: string;
    metadata: EpisodeMetadata;
}

const featuredEpisodeSchema = z.object({
    season_number: z.number().int(),
    episode_number: z.number().int(),
    name: z.string().nullish(),
    overview: z.string().nullish(),
    runtime: z.number().nullish(),
    still_path: z.string().nullish(),
});
const episodeSchema = z.object({
    air_date: z.string().nullish(),
    episode_number: z.number(),
    id: z.number().nullish(),
    name: z.string().nullish(),
    overview: z.string().nullish(),
    runtime: z.number().nullish(),
    season_number: z.number(),
    still_path: z.string().nullish(),
});
type TmdbEpisode = z.infer<typeof episodeSchema>;

const requestConcurrency = 4;
// Sparse per-episode endpoints are optional fallbacks. Bound them so one
// long-running release cannot turn a refresh into thousands of requests.
const episodeFallbackBudget = 24;

async function mapConcurrent<T, R>(values: T[], map: (value: T, index: number) => Promise<R>) {
    const results = Array<R>(values.length);
    let next = 0;
    const worker = async () => {
        while (next < values.length) {
            const index = next++;
            results[index] = await map(values[index], index);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(requestConcurrency, values.length) }, () => worker())
    );

    return results;
}

function withStoredMachineText(entries: MetadataEntry[], stored: Map<string, StoredEpisodeText>) {
    const metadata = new Map(entries.map(({ id, metadata }) => [id, { ...metadata }]));

    for (const { id } of entries) {
        const episode = metadata.get(id);
        if (!episode) {
            continue;
        }
        const previous = stored.get(id);

        if (!episode.title) {
            if (previous?.titleSource === 'machine' && previous.title) {
                episode.title = previous.title;
                episode.titleSource = 'machine';
            }
        }

        if (!episode.overview) {
            if (previous?.overviewSource === 'machine' && previous.overview) {
                episode.overview = previous.overview;
                episode.overviewSource = 'machine';
            }
        }
    }

    return metadata;
}

function displayAirDate(value: string | null | undefined) {
    const [year, month, day] = (value ?? '').split('-');
    return year && month && day ? `${month}/${day}/${year}` : '';
}

function featuredEpisode(value: JsonValue) {
    const parsed = featuredEpisodeSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }

    return {
        seasonNumber: parsed.data.season_number,
        episodeNumber: parsed.data.episode_number,
        details: {
            name: parsed.data.name ?? undefined,
            overview: parsed.data.overview ?? undefined,
            runtime: parsed.data.runtime ?? undefined,
            stillPath: parsed.data.still_path ?? undefined,
        },
    };
}

function episodeCandidate(episode: TmdbEpisode): EpisodeCandidate {
    return {
        tmdbEpisodeId: episode.id ?? undefined,
        episodeNumber: episode.episode_number,
        seasonNumber: episode.season_number,
        title: episode.name?.trim() ?? '',
        overview: episode.overview?.trim() ?? '',
        imageUrl: episode.still_path ? imageUrl(episode.still_path, 'w500') : null,
        runtime: episode.runtime && episode.runtime > 0 ? episode.runtime : null,
        rawAirDate: episode.air_date ?? '',
        airDate: displayAirDate(episode.air_date),
    };
}

function parseEpisodeCandidate(value: JsonValue) {
    const parsed = episodeSchema.safeParse(value);
    return parsed.success ? episodeCandidate(parsed.data) : null;
}

function bestImagePath(
    images:
        | Array<{
              file_path?: string;
              vote_average: number;
              vote_count: number;
              width: number;
          }>
        | undefined
) {
    return images
        ?.filter((image): image is typeof image & { file_path: string } => Boolean(image.file_path))
        .toSorted(
            (left, right) =>
                right.vote_average - left.vote_average ||
                right.vote_count - left.vote_count ||
                right.width - left.width
        )[0]?.file_path;
}

async function episodeGroupCandidates(
    client: ReturnType<typeof create>,
    seriesId: number,
    anime: AniListAnime,
    source: ProviderEpisode[]
) {
    const { data } = await client.GET('/3/tv/{series_id}/episode_groups', {
        params: { path: { series_id: seriesId } },
    });
    if (!data) {
        return null;
    }

    const groupIds = (data.results ?? []).flatMap(({ id }) => (id ? [id] : []));
    const groups = await mapConcurrent(groupIds, (id) =>
        client
            .GET('/3/tv/episode_group/{tv_episode_group_id}', {
                params: {
                    path: {
                        tv_episode_group_id: id,
                    },
                },
            })
            .then(({ data: group }) => group)
            .catch(() => undefined)
    );
    const blocks: EpisodeGroupBlock[] = groups.flatMap((group) =>
        (group?.groups ?? []).map((block) => ({
            episodes: (block.episodes ?? []).flatMap((episode, index) => {
                const parsed = z.json().safeParse(episode);
                const candidate = parsed.success ? parseEpisodeCandidate(parsed.data) : null;
                return candidate
                    ? [
                          {
                              ...candidate,
                              order: Number.isSafeInteger(episode.order) ? episode.order : index,
                          },
                      ]
                    : [];
            }),
            name: block.name,
            order: block.order,
        }))
    );

    return releaseEpisodeGroup(anime, source, blocks);
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
    expectedSequence: number | null
) {
    let score = 0;
    const seasonYear = Number(season.air_date?.slice(0, 4)) || null;

    if (expectedCount > 0 && season.episode_count === expectedCount) {
        score += 80;
    }

    if (season.episode_count >= largestSourceNumber) {
        score += 10;
    }

    if (expectedSequence === season.season_number) {
        score += 60;
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

export async function getEpisodeMetadata(
    anime: AniListAnime,
    source: ProviderEpisode[],
    storedMapping?: StoredMapping,
    storedText = new Map<string, StoredEpisodeText>()
): Promise<Map<string, EpisodeMetadata>> {
    if (!source.length) {
        return new Map();
    }

    const match = storedMapping ?? (await resolveStored(anime));
    const client = create();

    if (match.mediaType === 'movie') {
        const { data: movie, error } = await client.GET('/3/movie/{movie_id}', {
            params: {
                path: { movie_id: match.id },
                query: { language: 'en-US' },
            },
        });

        if (!movie) {
            throw new Error('TMDB movie request failed', {
                cause: error,
            });
        }

        const [translations, images] = await Promise.all([
            movie.original_language !== 'en' || !movie.overview?.trim() || !movie.title?.trim()
                ? client
                      .GET('/3/movie/{movie_id}/translations', {
                          params: { path: { movie_id: match.id } },
                      })
                      .then(({ data }) => data?.translations)
                      .catch(() => undefined)
                : Promise.resolve(undefined),
            !movie.backdrop_path && !movie.poster_path
                ? client
                      .GET('/3/movie/{movie_id}/images', {
                          params: { path: { movie_id: match.id } },
                      })
                      .then(({ data }) => data)
                      .catch(() => undefined)
                : Promise.resolve(undefined),
        ]);
        const localized = translations?.map((translation) => ({
            country: translation.iso_3166_1,
            language: translation.iso_639_1,
            name: translation.data?.title,
            overview: translation.data?.overview,
        }));
        const translated = translatedMetadata(localized);
        const originalIsEnglish = movie.original_language === 'en';
        const image =
            movie.backdrop_path ??
            movie.poster_path ??
            bestImagePath(images?.backdrops) ??
            bestImagePath(images?.posters);
        const title =
            (originalIsEnglish ? movie.title?.trim() || translated.name : translated.name) ?? '';
        const overview = originalIsEnglish
            ? movie.overview?.trim() || translated.overview || ''
            : translated.overview || '';

        return withStoredMachineText(
            [
                ...movieEpisodeMetadata(source, {
                    title,
                    titleSource: title ? 'tmdb' : null,
                    overview,
                    overviewSource: overview ? 'tmdb' : null,
                    imageUrl: image ? imageUrl(image, 'w500') : null,
                    runtime: movie.runtime || null,
                    airDate: displayAirDate(movie.release_date),
                }),
            ].map(([id, metadata]) => ({ id, metadata })),
            storedText
        );
    }

    const { data: series, error } = await client.GET('/3/tv/{series_id}', {
        params: {
            path: { series_id: match.id },
            query: { language: 'en-US' },
        },
    });

    if (!series) {
        throw new Error('TMDB series request failed', { cause: error });
    }

    const seasons = series.seasons ?? [];
    const regularSeasons = seasons.filter(({ season_number }) => season_number > 0);
    const specialSeasons = seasons.filter(({ season_number }) => season_number === 0);
    const largestSourceNumber = Math.max(
        0,
        ...source.filter(({ number }) => Number.isInteger(number)).map(({ number }) => number)
    );
    const expectedCount = anime.episodes ?? largestSourceNumber;
    const startDate = animeDate(anime.startDate);
    const startYear = anime.startDate?.year ?? anime.seasonYear ?? null;
    const expectedSequence = releaseSequence(anime);
    const largestSeason = Math.max(0, ...regularSeasons.map(({ episode_count }) => episode_count));
    const ranked = regularSeasons
        .map((season) => ({
            season,
            score: seasonScore(
                season,
                expectedCount,
                largestSourceNumber,
                startDate,
                startYear,
                expectedSequence
            ),
        }))
        .sort((left, right) => right.score - left.score);
    const selectedRegular = expectedCount > largestSeason ? ranked : ranked.slice(0, 4);
    const selected = [
        ...new Map(
            [
                ...selectedRegular,
                ...specialSeasons.map((season) => ({
                    season,
                    score: 0,
                })),
            ].map((rankedSeason) => [rankedSeason.season.season_number, rankedSeason])
        ).values(),
    ];
    const [fetched, grouped] = await Promise.all([
        mapConcurrent(selected, async ({ season }): Promise<EpisodeCandidate[]> => {
            const response = await client.GET('/3/tv/{series_id}/season/{season_number}', {
                params: {
                    path: {
                        series_id: match.id,
                        season_number: season.season_number,
                    },
                    query: { language: 'en-US' },
                },
            });

            if (!response.data) {
                return [];
            }

            return (response.data.episodes ?? []).flatMap((episode) => {
                const candidate = parseEpisodeCandidate(episode);
                return candidate ? [candidate] : [];
            });
        }),
        episodeGroupCandidates(client, match.id, anime, source).catch(() => null),
    ]);

    const available = fetched.flat();
    const matched = matchBestEpisodeMetadata(
        anime,
        source,
        grouped ?? releaseWindowEpisodeGroup(anime, available),
        available
    );
    const sourceById = new Map(source.map((episode) => [episode.id, episode]));
    let fallbacks = 0;
    const matches = [...matched.entries()].map(([sourceId, candidate]) => {
        const localizedText = hasRequestedEpisodeLocalization(
            sourceById.get(sourceId)?.title ?? '',
            candidate.title,
            series.original_language
        );
        const needed = episodeDetailsNeeded(candidate, localizedText);
        const needsFallback = needed.details || needed.translations || needed.images;
        const fetchFallback = needsFallback && fallbacks < episodeFallbackBudget;
        if (fetchFallback) {
            fallbacks += 1;
        }

        return {
            sourceId,
            candidate,
            localizedText,
            needed,
            fetchFallback,
        };
    });
    const completed = await mapConcurrent(
        matches,
        async ({ sourceId, candidate, localizedText, needed, fetchFallback }) => {
            if (!fetchFallback) {
                return {
                    id: sourceId,
                    metadata: completeEpisodeDetails(candidate, {
                        localizedText,
                        image: (path) => imageUrl(path, 'w500'),
                    }),
                };
            }

            const path = {
                series_id: match.id,
                season_number: candidate.seasonNumber,
                episode_number: candidate.episodeNumber,
            };
            const detailsRequest = needed.details
                ? client
                      .GET('/3/tv/{series_id}/season/{season_number}/episode/{episode_number}', {
                          params: {
                              path,
                              query: { language: 'en-US' },
                          },
                      })
                      .then(({ data }) => data)
                      .catch(() => undefined)
                : Promise.resolve(undefined);
            const translationsRequest = needed.translations
                ? client
                      .GET(
                          '/3/tv/{series_id}/season/{season_number}/episode/{episode_number}/translations',
                          { params: { path } }
                      )
                      .then(({ data }) => data?.translations)
                      .catch(() => undefined)
                : Promise.resolve(undefined);
            const imagesRequest = needed.images
                ? client
                      .GET(
                          '/3/tv/{series_id}/season/{season_number}/episode/{episode_number}/images',
                          {
                              params: { path },
                          }
                      )
                      .then(({ data }) => data?.stills)
                      .catch(() => undefined)
                : Promise.resolve(undefined);
            const changesRequest = fetchFallback
                ? getEpisodeChanges(candidate.tmdbEpisodeId, candidate.rawAirDate).catch(() => null)
                : Promise.resolve(null);
            const [details, translations, stills, changes] = await Promise.all([
                detailsRequest,
                translationsRequest,
                imagesRequest,
                changesRequest,
            ]);
            const featured = [series.last_episode_to_air, series.next_episode_to_air]
                .map((value) => {
                    const parsed = z.json().safeParse(value);
                    return parsed.success ? featuredEpisode(parsed.data) : null;
                })
                .find(
                    (episode) =>
                        episode?.seasonNumber === candidate.seasonNumber &&
                        episode.episodeNumber === candidate.episodeNumber
                );

            const localized = (translations ?? []).map((translation) => ({
                country: translation.iso_3166_1,
                language: translation.iso_639_1,
                name: translation.data?.name,
                overview: translation.data?.overview,
            }));
            return {
                id: sourceId,
                metadata: completeEpisodeDetails(candidate, {
                    details: details
                        ? {
                              name: details.name,
                              overview: details.overview,
                              runtime: details.runtime,
                              stillPath: details.still_path,
                          }
                        : undefined,
                    translations: localized,
                    stills: stills?.map((still) => ({
                        filePath: still.file_path,
                        voteAverage: still.vote_average,
                        voteCount: still.vote_count,
                        width: still.width,
                    })),
                    featured: featured?.details,
                    changes: changes ?? undefined,
                    localizedText,
                    image: (path) => imageUrl(path, 'w500'),
                }),
            };
        }
    );

    return withStoredMachineText(completed, storedText);
}
