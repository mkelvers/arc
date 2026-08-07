import { audioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';
import type { AnimeSeasonSelection } from '$lib/anime/season';
import type { AnimeCard } from '$lib/anime/types';
import {
  AllAnimeAvailableEpisodesDocument,
  AllAnimeSearchDocument,
  AllAnimeSimulcastPageDocument,
  AllAnimeWeeklyPopularDocument,
  type AllAnimeAvailableEpisodesQuery,
  type AllAnimeSearchQuery,
  type VaildTranslationTypeEnumType,
} from '$lib/graphql/allanime/generated/graphql';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from '../providers/mapping';
import { RequestCache } from '$lib/server/request-cache';
import { nonEmptyText, positiveInteger, record } from '$lib/utils';
import { plainText } from '../anilist/text';
import { request } from './client';
import type { AniListAnime, Episode } from './types';

const audioCacheLifetime = 30 * 60 * 1_000;
const providerName = 'allanime';
const simulcastPageSize = 24;
const simulcastPages = new RequestCache<string, SimulcastPage>(30 * 60 * 1_000);

interface SimulcastPage {
  anime: AnimeCard[];
  hasNextPage: boolean;
  page: number;
}

interface WeeklyPopularAnime {
  anilistId: number;
  audio: AudioMode[];
}

let popularCache: {
  anime: WeeklyPopularAnime[];
  fetchedAt: number;
} | null = null;
let popularRequest: Promise<WeeklyPopularAnime[]> | null = null;

function audioModes(value: unknown) {
  const detail = record(value);
  if (!detail) {
    return [];
  }

  return (['sub', 'dub', 'raw'] as const).filter((mode) => {
    const episodes = detail[mode];
    return Array.isArray(episodes) && episodes.length > 0;
  });
}

function matchesSeason(value: unknown, selected: AnimeSeasonSelection) {
  const season = record(value);
  const quarter = nonEmptyText(season?.quarter)?.toUpperCase();
  const year = positiveInteger(season?.year);

  return quarter === selected.season && year === selected.year;
}

function simulcastCard(show: {
  aniListId: number | string | null;
  availableEpisodesDetail: unknown;
  averageScore: number | null;
  description: string | null;
  englishName: string | null;
  genres: string[] | null;
  name: string | null;
  thumbnail: string | null;
}): AnimeCard | null {
  const id = positiveInteger(show.aniListId);
  const image = nonEmptyText(show.thumbnail);
  const title = nonEmptyText(show.englishName) ?? nonEmptyText(show.name);
  if (!id || !image || !title) {
    return null;
  }

  return {
    id,
    href: `/anime/${id}`,
    watchHref: `/anime/${id}`,
    title,
    image,
    caption: audioAvailabilityLabel(audioModes(show.availableEpisodesDetail)),
    score: Math.round(show.averageScore ?? 0),
    genres: [...new Set((show.genres ?? []).map((genre) => genre.trim()).filter(Boolean))],
    synopsis: plainText(show.description),
  };
}

async function requestSimulcastPage(selected: AnimeSeasonSelection, page: number) {
  const response = await request(AllAnimeSimulcastPageDocument, {
    search: {
      allowAdult: false,
      allowUnknown: false,
      season: `${selected.season[0]}${selected.season.slice(1).toLowerCase()}`,
      year: selected.year,
    },
    page,
    limit: simulcastPageSize,
  });
  const shows = response.shows?.edges ?? [];
  const seen = new Set<number>();
  const anime: AnimeCard[] = [];

  for (const show of shows) {
    if (!matchesSeason(show.season, selected)) {
      continue;
    }

    const card = simulcastCard(show);
    if (!card || seen.has(card.id)) {
      continue;
    }

    seen.add(card.id);
    anime.push(card);
  }

  return {
    anime,
    hasNextPage: shows.length === simulcastPageSize,
    page,
  };
}

export function getSimulcastPage(selected: AnimeSeasonSelection, page: number) {
  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new RangeError('Simulcast page must be a positive integer');
  }

  const key = `${selected.season}:${selected.year}:${page}`;
  return simulcastPages.get(
    key,
    () =>
      requestSimulcastPage(selected, page).catch((cause) => {
        console.error(`AllAnime simulcast ${key} refresh failed`, cause);
        throw cause;
      }),
    { staleIfError: true }
  );
}

export async function getWeeklyPopularAnime() {
  if (popularCache && Date.now() - popularCache.fetchedAt < audioCacheLifetime) {
    return popularCache.anime;
  }

  if (popularRequest) {
    return popularRequest;
  }

  popularRequest = request(AllAnimeWeeklyPopularDocument, {}).then((data) => {
    const recommendations = (data.queryPopular?.recommendations ?? [])
      .map((recommendation, index) => ({
        card: recommendation.anyCard,
        index,
      }))
      .toSorted(
        (left, right) =>
          (left.card?.siteRanks?.weekly?.position ?? left.index + 1) -
          (right.card?.siteRanks?.weekly?.position ?? right.index + 1)
      );
    const seen = new Set<number>();
    const anime: WeeklyPopularAnime[] = [];

    for (const { card } of recommendations) {
      const anilistId = Number(card?.aniListId);
      if (!Number.isSafeInteger(anilistId) || anilistId <= 0 || seen.has(anilistId)) {
        continue;
      }

      seen.add(anilistId);
      anime.push({
        anilistId,
        audio: audioModes(card?.availableEpisodesDetail),
      });
    }

    popularCache = { anime, fetchedAt: Date.now() };
    return anime;
  });

  try {
    return await popularRequest;
  } finally {
    popularRequest = null;
  }
}

export async function getPopularAudioLabels() {
  const anime = await getWeeklyPopularAnime();

  return new Map(
    anime.flatMap(({ anilistId, audio }) => (audio.length ? [[anilistId, audio] as const] : []))
  );
}

export async function findShowId(anime: AniListAnime, refresh = false) {
  if (!anime.idMal) {
    throw new Error(`AniList ${anime.id} has no MAL ID`);
  }

  if (!refresh) {
    const stored = await providerMediaId(anime.id, providerName);
    if (stored) {
      return stored;
    }
  }

  const titles = [
    anime.title?.english,
    anime.title?.romaji,
    anime.title?.native,
    ...(anime.synonyms ?? []),
  ].filter(
    (title, index, values): title is string =>
      Boolean(title?.trim()) && values.indexOf(title) === index
  );

  // Provider title search is only discovery. MAL identity remains the match
  // contract so similarly named seasons and movies cannot leak in.
  for (const mode of ['sub', 'dub', 'raw'] as const) {
    for (const query of titles) {
      const data = await request<
        AllAnimeSearchQuery,
        {
          search: {
            allowAdult: boolean;
            allowUnknown: boolean;
            query: string;
          };
          translationType: VaildTranslationTypeEnumType;
        }
      >(AllAnimeSearchDocument, {
        search: {
          allowAdult: false,
          allowUnknown: false,
          query,
        },
        translationType: mode,
      });
      const match = data.shows?.edges?.find(
        (show) => Number(show.malId) === anime.idMal && show._id
      );

      if (!match?._id) {
        continue;
      }

      await saveProviderMediaId(anime.id, providerName, match._id);

      return match._id;
    }
  }

  throw new Error(`AllAnime has no exact MAL match for ${anime.idMal}`);
}

export async function getEpisodes(anime: AniListAnime): Promise<Episode[]> {
  let showId = await findShowId(anime);
  const load = (id: string) =>
    request<AllAnimeAvailableEpisodesQuery, { showId: string; start: number; end: number }>(
      AllAnimeAvailableEpisodesDocument,
      {
        showId: id,
        start: 0,
        end: 100_000,
      }
    );
  let data = await load(showId);

  if (!data.show) {
    showId = await findShowId(anime, true);
    data = await load(showId);
  }

  if (!data.show) {
    throw new Error(`AllAnime show ${showId} was not found`);
  }

  await verifyProviderMediaId(anime.id, providerName);

  const detail = record(data.show.availableEpisodesDetail) ?? {};
  const strings = (key: AudioMode) => {
    const values = detail[key];

    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : [];
  };
  const sub = new Set(strings('sub'));
  const dub = new Set(strings('dub'));
  const raw = new Set(strings('raw'));
  const titles = new Map(
    (data.episodeInfos ?? []).flatMap((episode) => {
      const id = String(episode.episodeIdNum ?? '').trim();
      const title = (episode.notes ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replace(/\s+/g, ' ')
        .trim();

      return id && title ? [[id, title] as const] : [];
    })
  );

  return [...new Set([...sub, ...dub, ...raw])]
    .flatMap((id) => {
      const number = Number(id);

      if (!Number.isFinite(number) || number < 0) {
        return [];
      }

      return [
        {
          id,
          number,
          title: titles.get(id) ?? '',
          audio: [
            ...(sub.has(id) ? ['sub' as const] : []),
            ...(dub.has(id) ? ['dub' as const] : []),
            ...(raw.has(id) ? ['raw' as const] : []),
          ],
        },
      ];
    })
    .sort((left, right) => left.number - right.number);
}
