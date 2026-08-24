import { describe, expect, test } from 'bun:test';

import type { ProviderEpisode } from '../providers/types';
import { movieEpisodeMetadata } from './movie-episodes';

const release = {
    title: 'Kaguya-sama: Love Is War -The First Kiss That Never Ends-',
    titleSource: 'tmdb' as const,
    overview: 'Movie overview',
    overviewSource: 'tmdb' as const,
    imageUrl: 'https://image.tmdb.org/t/p/w500/release.jpg',
    runtime: 96,
    airDate: '12/17/2022',
};

function source(count: number): ProviderEpisode[] {
    return Array.from({ length: count }, (_, index) => ({
        id: String(index + 1),
        number: index + 1,
        title: `Night ${index + 1}`,
        audio: ['sub'],
    }));
}

describe('TMDB movie episode metadata', () => {
    test('keeps complete movie metadata for a one-episode release', () => {
        expect(movieEpisodeMetadata(source(1), release).get('1')).toEqual(release);
    });

    test('covers every split broadcast episode without copying whole-movie facts', () => {
        const metadata = movieEpisodeMetadata(source(4), release);

        expect([...metadata.keys()]).toEqual(['1', '2', '3', '4']);
        expect([...metadata.values()]).toEqual(
            Array.from({ length: 4 }, () => ({
                ...release,
                title: '',
                titleSource: null,
                overview: '',
                overviewSource: null,
                runtime: null,
                airDate: '',
            }))
        );
    });
});
