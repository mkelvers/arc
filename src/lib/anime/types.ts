import type { AudioMode } from './audio';
import { isRecord } from '$lib/utils';

export type AnimeCard = {
  id: number;
  href: string;
  watchHref: string;
  title: string;
  image: string;
  caption: string;
  score: number;
  genres: string[];
  synopsis: string;
};

export function isAnimeCard(value: unknown): value is AnimeCard {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.href === 'string' &&
    value.href.startsWith('/anime/') &&
    typeof value.watchHref === 'string' &&
    typeof value.title === 'string' &&
    typeof value.image === 'string' &&
    typeof value.caption === 'string' &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    Array.isArray(value.genres) &&
    value.genres.every((genre) => typeof genre === 'string') &&
    typeof value.synopsis === 'string'
  );
}

export type AnimeEpisode = {
  id: string;
  number: number;
  label: string;
  title: string;
  href: string;
  audio: AudioMode[];
  image: string | null;
  duration: string;
  releaseDate: string;
  overview: string;
};

export type ContinueWatchingCard = {
  animeId: number;
  title: string;
  watchHref: string;
  backdrop: string;
  episodeImage: string;
  episodeLabel: string;
  audioLabel: string;
  duration: string;
  resumeAtSeconds: number;
};

export type FranchiseOrder = {
  types: Array<{
    id: string;
    label: string;
  }>;
  entries: Array<
    AnimeCard & {
      malId: number;
      anilistId: number;
      type: string;
      secondary: boolean;
      primary: boolean;
    }
  >;
};
