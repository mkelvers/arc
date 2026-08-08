import { Schema } from 'effect';

import type { AudioMode } from './audio';

export const AnimeCardSchema = Schema.Struct({
  id: Schema.Int,
  href: Schema.String.pipe(Schema.startsWith('/anime/')),
  watchHref: Schema.String,
  title: Schema.String,
  image: Schema.String,
  caption: Schema.String,
  score: Schema.Finite,
  genres: Schema.Array(Schema.String),
  synopsis: Schema.String,
});

export type AnimeCard = typeof AnimeCardSchema.Type;

export const isAnimeCard = Schema.is(AnimeCardSchema);

const AnimeCardPageSchema = Schema.Struct({
  anime: Schema.Array(AnimeCardSchema),
  hasNextPage: Schema.Boolean,
  page: Schema.Int,
});

export const isAnimeCardPage = Schema.is(AnimeCardPageSchema);

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
