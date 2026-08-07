import { describe, expect, test } from 'bun:test';

import { isAnimeCard, type AnimeCard } from './types';

const card = {
  id: 1,
  href: '/anime/1',
  watchHref: '/anime/1',
  title: 'Test anime',
  image: 'https://images.example/anime.jpg',
  caption: 'Subtitled',
  score: 80,
  genres: [],
  synopsis: '',
} satisfies AnimeCard;

describe('anime card response validation', () => {
  test('accepts complete cards from paginated responses', () => {
    expect(isAnimeCard(card)).toBeTrue();
  });

  test('rejects invalid links and non-finite scores', () => {
    expect(isAnimeCard({ ...card, href: 'https://example.test' })).toBeFalse();
    expect(isAnimeCard({ ...card, score: Number.NaN })).toBeFalse();
  });
});
