import { describe, expect, test } from 'bun:test';

import { fetchOrder } from '../franchise/chiaki';

const animeIds = [
    16498, 18397, 21459, 97940, 99263, 101280, 101922, 105310, 105333, 108465, 113415, 11757,
    120377, 125206, 131573, 137822, 146984, 151807, 153288, 154587,
];

interface AniListResponse {
    data?: {
        Page?: {
            media?: Array<{
                coverImage?: { extraLarge?: string | null } | null;
                format?: string | null;
                id: number;
            } | null> | null;
        } | null;
    };
}

interface TmdbImagesResponse {
    posters?: Array<{
        aspect_ratio?: number;
        file_path?: string;
        height?: number;
        width?: number;
    }>;
}

async function tmdbPosters(seriesId: number) {
    const token = process.env.TMDB_READ_ACCESS_TOKEN;
    if (!token) {
        throw new Error('TMDB_READ_ACCESS_TOKEN is required');
    }

    const response = await fetch(`https://api.themoviedb.org/3/tv/${seriesId}/images`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    expect(response.ok).toBe(true);

    const data = (await response.json()) as TmdbImagesResponse;
    return (data.posters ?? []).filter(
        ({ aspect_ratio, file_path, height, width }) =>
            file_path && width && height && aspect_ratio && Math.abs(aspect_ratio - 2 / 3) < 0.08
    );
}

describe('live anime card artwork providers', () => {
    test.skip('AniList returns distinct covers across television, movie, OVA, ONA, and special releases', async () => {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: `
                        query ($ids: [Int]) {
                            Page(perPage: 50) {
                                media(id_in: $ids, type: ANIME) {
                                    id
                                    format
                                    coverImage { extraLarge }
                                }
                            }
                        }
                    `,
                variables: {
                    ids: animeIds,
                },
            }),
        });
        expect(response.ok).toBe(true);

        const result = (await response.json()) as AniListResponse;
        const media = (result.data?.Page?.media ?? []).filter(
            (entry): entry is NonNullable<typeof entry> => entry !== null
        );

        expect(media).toHaveLength(animeIds.length);
        expect(new Set(media.map(({ format }) => format))).toEqual(
            new Set(['MOVIE', 'ONA', 'OVA', 'SPECIAL', 'TV'])
        );
        expect(new Set(media.map(({ coverImage }) => coverImage?.extraLarge)).size).toBe(
            animeIds.length
        );
    }, 20_000);

    test.skip('aggregate TMDB series expose enough distinct high-resolution posters for release allocation', async () => {
        const samples = await Promise.all([95479, 1429, 65930, 82684].map(tmdbPosters));

        for (const posters of samples) {
            expect(new Set(posters.map(({ file_path }) => file_path)).size).toBeGreaterThanOrEqual(
                8
            );
            expect(
                posters.some(({ height, width }) => (width ?? 0) >= 1_000 && (height ?? 0) >= 1_500)
            ).toBe(true);
        }
    }, 20_000);

    test.skip('Chiaki resolves Attack on Titan from its first and final releases', async () => {
        const [first, final] = await Promise.all([fetchOrder(16498), fetchOrder(51535)]);
        const expected = [16498, 25777, 35760, 38524, 40028, 48583, 51535];

        for (const id of expected) {
            expect(first.entries.some(({ malId }) => malId === id)).toBe(true);
            expect(final.entries.some(({ malId }) => malId === id)).toBe(true);
        }
    }, 20_000);
});
