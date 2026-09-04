import { describe, expect, test } from 'bun:test';

import { AnimeCardPageSchema, type AnimeCard } from '@arc/core/browser';

const card = {
    id: 1,
    href: '/anime/1',
    link: '/anime/1',
    title: 'Test anime',
    image: 'https://images.example/anime.jpg',
    audioLabel: 'Subtitled',
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
        expect(AnimeCardPageSchema.safeParse(page).success).toBeTrue();
    });

    test('rejects malformed pages and invalid cards', () => {
        expect(
            AnimeCardPageSchema.safeParse({
                ...page,
                anime: [
                    {
                        ...card,
                        id: '1',
                    },
                ],
            }).success
        ).toBeFalse();
        expect(
            AnimeCardPageSchema.safeParse({
                ...page,
                anime: [
                    {
                        ...card,
                        id: 0,
                    },
                ],
            }).success
        ).toBeFalse();
        expect(
            AnimeCardPageSchema.safeParse({
                ...page,
                anime: [
                    {
                        ...card,
                        score: Number.NaN,
                    },
                ],
            }).success
        ).toBeFalse();
        expect(AnimeCardPageSchema.safeParse({ ...page, page: 1.5 }).success).toBeFalse();
        expect(AnimeCardPageSchema.safeParse({ ...page, hasNextPage: 'yes' }).success).toBeFalse();
    });
});
