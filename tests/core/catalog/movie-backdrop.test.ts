import { describe, expect, test } from 'bun:test';

import type { AnimeEpisode } from '@arc/shared/types';
import { withMovieBackdrop } from '@arc/core/catalog/movie-backdrop';

const episode: AnimeEpisode = {
    id: 'movie',
    number: 1,
    label: 'E1',
    title: 'Movie',
    href: '/anime/164/watch/movie',
    audio: ['sub'],
    image: 'https://image.tmdb.org/t/p/w500/default-movie-backdrop.jpg',
    duration: '2h 14m',
    releaseDate: '07/12/1997',
    overview: '',
};

describe('movie episode artwork', () => {
    test('uses the anime page backdrop for a movie episode', () => {
        expect(
            withMovieBackdrop(
                { format: 'MOVIE' },
                [episode],
                'https://image.tmdb.org/t/p/original/selected-backdrop.jpg'
            )[0].image
        ).toBe('https://image.tmdb.org/t/p/original/selected-backdrop.jpg');
    });

    test('keeps TV episode stills', () => {
        expect(
            withMovieBackdrop(
                { format: 'TV' },
                [episode],
                'https://image.tmdb.org/t/p/original/selected-backdrop.jpg'
            )[0].image
        ).toBe(episode.image);
    });

    test('keeps the stored movie image when no backdrop is available', () => {
        expect(withMovieBackdrop({ format: 'MOVIE' }, [episode], null)[0].image).toBe(
            episode.image
        );
    });
});
