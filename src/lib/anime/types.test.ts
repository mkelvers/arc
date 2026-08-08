import { describe, expect, test } from 'bun:test';

import { isAnimeCardPage, type AnimeCard } from './types';

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

describe('anime card page response validation', () => {
  const page = {
    anime: [card],
    hasNextPage: true,
    page: 1,
  };

  test('accepts complete paginated responses', () => {
    expect(isAnimeCardPage(page)).toBeTrue();
  });

  test('rejects malformed pages and invalid cards', () => {
    expect(
      isAnimeCardPage({
        ...page,
        anime: [{ ...card, id: '1' }],
      })
    ).toBeFalse();
    expect(isAnimeCardPage({ ...page, anime: [{ ...card, href: 'https://example.test' }] })).toBe(
      false
    );
    expect(isAnimeCardPage({ ...page, anime: [{ ...card, score: Number.NaN }] })).toBeFalse();
    expect(isAnimeCardPage({ ...page, page: 1.5 })).toBeFalse();
    expect(isAnimeCardPage({ ...page, hasNextPage: 'yes' })).toBeFalse();
  });
});
