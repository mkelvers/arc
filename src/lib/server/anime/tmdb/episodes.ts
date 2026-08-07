import type { ProviderEpisode } from '../providers/types';
import { translateToEnglish } from '../translation';
import { isRecord } from '$lib/utils';
import { create, imageUrl } from './client';
import {
  completeEpisodeDetails,
  episodeDetailsNeeded,
  hasRequestedEpisodeLocalization,
  translatableMetadata,
  translatedMetadata,
} from './episode-details';
import { releaseEpisodeGroup, type EpisodeGroupBlock } from './episode-groups';
import { matchBestEpisodeMetadata } from './episode-match';
import { resolveStored } from './mapping';
import { releaseSequence } from './title';
import type {
  AniListAnime,
  EpisodeCandidate,
  EpisodeMetadata,
  StoredEpisodeText,
  StoredMapping,
} from './types';

interface MetadataEntry {
  id: string;
  metadata: EpisodeMetadata;
  source: {
    name?: string | null;
    overview?: string | null;
  };
}

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

async function withMachineTranslation(
  entries: MetadataEntry[],
  stored: Map<string, StoredEpisodeText>,
  anilistId: number
) {
  const metadata = new Map(entries.map(({ id, metadata }) => [id, { ...metadata }]));
  const jobs: Array<{
    id: string;
    field: 'title' | 'overview';
    text: string;
  }> = [];

  for (const { id, source } of entries) {
    const episode = metadata.get(id);
    if (!episode) {
      continue;
    }
    const previous = stored.get(id);

    if (!episode.title) {
      if (previous?.titleSource === 'machine' && previous.title) {
        episode.title = previous.title;
        episode.titleSource = 'machine';
      } else if (source.name?.trim()) {
        jobs.push({
          id,
          field: 'title',
          text: source.name.trim(),
        });
      }
    }

    if (!episode.overview) {
      if (previous?.overviewSource === 'machine' && previous.overview) {
        episode.overview = previous.overview;
        episode.overviewSource = 'machine';
      } else if (source.overview?.trim()) {
        jobs.push({
          id,
          field: 'overview',
          text: source.overview.trim(),
        });
      }
    }
  }

  if (!jobs.length) {
    return metadata;
  }

  try {
    const translated = await translateToEnglish(jobs.map(({ text }) => text));

    jobs.forEach(({ id, field }, index) => {
      const episode = metadata.get(id);
      const value = translated[index];
      if (!episode || !value) {
        return;
      }

      if (field === 'title') {
        episode.title = value;
        episode.titleSource = 'machine';
      } else {
        episode.overview = value;
        episode.overviewSource = 'machine';
      }
    });
  } catch (cause) {
    console.warn(`Local episode translation failed for AniList ${anilistId}`, cause);
  }

  return metadata;
}

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

function featuredEpisode(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const seasonNumber = Number(value.season_number);
  const episodeNumber = Number(value.episode_number);
  if (!Number.isSafeInteger(seasonNumber) || !Number.isSafeInteger(episodeNumber)) {
    return null;
  }

  return {
    seasonNumber,
    episodeNumber,
    details: {
      name: typeof value.name === 'string' ? value.name : undefined,
      overview: typeof value.overview === 'string' ? value.overview : undefined,
      runtime: typeof value.runtime === 'number' ? value.runtime : undefined,
      stillPath: typeof value.still_path === 'string' ? value.still_path : undefined,
    },
  };
}

function largestNumber(source: ProviderEpisode[]) {
  return Math.max(
    0,
    ...source.filter(({ number }) => Number.isInteger(number)).map(({ number }) => number)
  );
}

function episodeCandidate(episode: {
  air_date?: string;
  episode_number: number;
  name?: string;
  overview?: string;
  runtime?: unknown;
  season_number: number;
  still_path?: unknown;
}): EpisodeCandidate {
  const stillPath = typeof episode.still_path === 'string' ? episode.still_path : null;

  return {
    episodeNumber: episode.episode_number,
    seasonNumber: episode.season_number,
    title: episode.name?.trim() ?? '',
    overview: episode.overview?.trim() ?? '',
    imageUrl: stillPath ? imageUrl(stillPath, 'w500') : null,
    runtime: typeof episode.runtime === 'number' && episode.runtime > 0 ? episode.runtime : null,
    rawAirDate: episode.air_date ?? '',
    airDate: displayAirDate(episode.air_date),
  };
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
      episodes: (block.episodes ?? []).flatMap((episode, index) =>
        Number.isSafeInteger(episode.season_number) && Number.isSafeInteger(episode.episode_number)
          ? [
              {
                ...episodeCandidate(episode),
                order: Number.isSafeInteger(episode.order) ? episode.order : index,
              },
            ]
          : []
      ),
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
    if (source.length !== 1) {
      return new Map();
    }

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
    const translatable = translatableMetadata(localized, movie.original_language);
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

    return withMachineTranslation(
      [
        {
          id: source[0].id,
          metadata: {
            title,
            titleSource: title ? 'tmdb' : null,
            overview,
            overviewSource: overview ? 'tmdb' : null,
            imageUrl: image ? imageUrl(image, 'w500') : null,
            runtime: movie.runtime || null,
            airDate: displayAirDate(movie.release_date),
          },
          source: translatable,
        },
      ],
      storedText,
      anime.id
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
  const largestSourceNumber = largestNumber(source);
  const expectedCount = anime.episodes ?? largestSourceNumber;
  const startDate = animeStartDate(anime);
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
    mapConcurrent(selected, async ({ season }) => {
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
        return [] as EpisodeCandidate[];
      }

      return (response.data.episodes ?? []).map(episodeCandidate);
    }),
    episodeGroupCandidates(client, match.id, anime, source).catch(() => null),
  ]);

  const matched = matchBestEpisodeMetadata(anime, source, grouped, fetched.flat());
  const sourceById = new Map(source.map((episode) => [episode.id, episode]));
  let fallbacks = 0;
  const matches = [...matched.entries()].map(([sourceId, candidate]) => {
    const localizedText = hasRequestedEpisodeLocalization(
      sourceById.get(sourceId)?.title ?? '',
      candidate.title,
      series.original_language
    );
    const needed = episodeDetailsNeeded(candidate, localizedText);
    const previous = storedText.get(sourceId);
    const storedTextComplete = Boolean(
      previous?.titleSource &&
      previous.title?.trim() &&
      previous.overviewSource &&
      previous.overview?.trim()
    );
    if (storedTextComplete) {
      needed.translations = false;
    }
    const needsFallback = needed.details || needed.translations || needed.images;
    const fetchFallback = needsFallback && fallbacks++ < episodeFallbackBudget;

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
          source: {},
        };
      }

      const path = {
        series_id: match.id,
        season_number: candidate.seasonNumber,
        episode_number: candidate.episodeNumber,
      };
      const detailsRequest =
        fetchFallback && needed.details
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
      const translationsRequest =
        fetchFallback && needed.translations
          ? client
              .GET(
                '/3/tv/{series_id}/season/{season_number}/episode/{episode_number}/translations',
                { params: { path } }
              )
              .then(({ data }) => data?.translations)
              .catch(() => undefined)
          : Promise.resolve(undefined);
      const imagesRequest =
        fetchFallback && needed.images
          ? client
              .GET('/3/tv/{series_id}/season/{season_number}/episode/{episode_number}/images', {
                params: { path },
              })
              .then(({ data }) => data?.stills)
              .catch(() => undefined)
          : Promise.resolve(undefined);
      const [details, translations, stills] = await Promise.all([
        detailsRequest,
        translationsRequest,
        imagesRequest,
      ]);
      const featured = [series.last_episode_to_air, series.next_episode_to_air]
        .map(featuredEpisode)
        .find(
          (episode) =>
            episode?.seasonNumber === candidate.seasonNumber &&
            episode.episodeNumber === candidate.episodeNumber
        );

      const localized = translations?.map((translation) => ({
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
          localizedText,
          image: (path) => imageUrl(path, 'w500'),
        }),
        source: translatableMetadata(localized, series.original_language),
      };
    }
  );

  return withMachineTranslation(completed, storedText, anime.id);
}
