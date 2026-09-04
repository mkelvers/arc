import { describe, expect, test } from 'bun:test';

import { animeCard } from '@arc/core';

describe('AniList catalog cards', () => {
    test('returns a normalized card when artwork exists', () => {
        expect(
            animeCard({
                id: 42,
                title: { english: 'Title', romaji: null, native: null },
                coverImage: { extraLarge: 'https://image.test/title.jpg', large: null },
                description: '<b>Story</b>',
                genres: ['Action', null],
                averageScore: null,
                format: 'TV',
                status: 'FINISHED',
            })
        ).toEqual({
            id: 42,
            href: '/anime/42',
            link: '/anime/42',
            title: 'Title',
            image: 'https://image.test/title.jpg',
            audioLabel: '',
            format: 'TV',
            status: 'FINISHED',
            score: 0,
            genres: ['Action'],
            synopsis: 'Story',
        });
    });

    test('rejects media without artwork', () => {
        expect(animeCard({ id: 42, coverImage: null })).toBeNull();
    });
});
