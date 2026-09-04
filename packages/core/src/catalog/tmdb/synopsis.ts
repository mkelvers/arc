import type { AniListAnime } from '../anilist-types';
import { create } from './client';
import { resolveStored } from './mapping';

export async function getTmdbSynopsis(anime: AniListAnime) {
    const mapping = await resolveStored(anime, { refresh: true });
    const client = create();

    if (mapping.mediaType === 'movie') {
        const { data, error } = await client.GET('/3/movie/{movie_id}', {
            params: {
                path: {
                    movie_id: mapping.id,
                },
                query: {
                    language: 'en-US',
                },
            },
        });
        if (!data) {
            throw new Error(`TMDB movie synopsis request failed for ${mapping.id}`, {
                cause: error,
            });
        }

        return {
            synopsis: data.overview?.trim() || null,
            sourceAnilistId: anime.id,
            tmdbExternalIdId: mapping.externalIdId,
        };
    }

    const { data: series, error } = await client.GET('/3/tv/{series_id}', {
        params: {
            path: {
                series_id: mapping.id,
            },
            query: {
                language: 'en-US',
            },
        },
    });
    if (!series) {
        throw new Error(`TMDB series synopsis request failed for ${mapping.id}`, { cause: error });
    }

    let synopsis = series.overview?.trim() || null;
    if (!synopsis) {
        const firstSeason = (series.seasons ?? [])
            .filter(({ season_number }) => season_number > 0)
            .toSorted((left, right) => left.season_number - right.season_number)[0];

        if (firstSeason) {
            const { data: season } = await client.GET('/3/tv/{series_id}/season/{season_number}', {
                params: {
                    path: {
                        series_id: mapping.id,
                        season_number: firstSeason.season_number,
                    },
                    query: {
                        language: 'en-US',
                    },
                },
            });
            synopsis = season?.overview?.trim() || null;
        }
    }

    return {
        synopsis,
        sourceAnilistId: anime.id,
        tmdbExternalIdId: mapping.externalIdId,
    };
}
