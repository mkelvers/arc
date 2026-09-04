import { z } from 'zod';

const tmdbPayload = z.looseObject({});

export interface TmdbClient {
    GET(
        path: string,
        options?: {
            params?: {
                path?: Record<string, number | string>;
                query?: Record<string, boolean | number | string>;
            };
        }
    ): Promise<{ data?: TmdbResponse; error?: unknown }>;
}

export interface TmdbResponse {
    backdrop_path?: string | null;
    backdrops?: TmdbImage[];
    episodes?: TmdbEpisode[];
    first_air_date?: string | null;
    id?: number;
    images?: TmdbImages;
    logos?: TmdbImage[];
    last_episode_to_air?: TmdbEpisode | null;
    name?: string | null;
    next_episode_to_air?: TmdbEpisode | null;
    original_language?: string | null;
    original_name?: string | null;
    original_title?: string | null;
    overview?: string | null;
    poster_path?: string | null;
    posters?: TmdbImage[];
    popularity?: number;
    release_date?: string | null;
    results?: TmdbSearchResult[];
    runtime?: number | null;
    seasons?: TmdbSeason[];
    season_number?: number;
    episode_number?: number;
    still_path?: string | null;
    stills?: TmdbStill[];
    title?: string | null;
    translations?: TmdbTranslation[];
    groups?: TmdbEpisodeGroup[];
    changes?: TmdbChange[];
}

interface TmdbImage {
    aspect_ratio?: number;
    file_path?: string;
    height?: number;
    iso_639_1?: string | null;
    vote_average: number;
    vote_count: number;
    width: number;
}

interface TmdbStill {
    file_path?: string | null;
    vote_average: number;
    vote_count: number;
    width: number;
}

interface TmdbImages {
    backdrops?: TmdbImage[];
    posters?: TmdbImage[];
    logos?: TmdbImage[];
}

interface TmdbEpisode {
    air_date?: string | null;
    episode_number: number;
    id?: number | null;
    name?: string | null;
    overview?: string | null;
    runtime?: number | null;
    season_number: number;
    still_path?: string | null;
    order?: number;
}

interface TmdbSeason {
    air_date?: string;
    episode_count: number;
    name?: string | null;
    poster_path?: string | null;
    season_number: number;
}

interface TmdbSearchResult {
    first_air_date?: string | null;
    id?: number;
    name?: string | null;
    original_name?: string | null;
    original_title?: string | null;
    popularity?: number;
    release_date?: string | null;
    title?: string | null;
}

interface TmdbTranslation {
    iso_3166_1?: string;
    iso_639_1?: string;
    data?: {
        name?: string | null;
        overview?: string | null;
        title?: string | null;
    };
}

interface TmdbEpisodeGroup {
    episodes?: TmdbEpisode[];
    name?: string;
    order: number;
}

interface TmdbChange {
    key?: string;
    items?: Array<{
        iso_639_1?: string;
        iso_3166_1?: string;
        value: unknown;
    }>;
}

export function create(): TmdbClient {
    const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
    if (!token) {
        throw new TypeError('TMDB_READ_ACCESS_TOKEN is required');
    }

    return {
        async GET(path, options) {
            const pathParams = options?.params?.path ?? {};
            const resolvedPath = path.replace(/\{([^}]+)\}/g, (_, name: string) =>
                encodeURIComponent(String(pathParams[name] ?? ''))
            );
            const url = new URL(`https://api.themoviedb.org${resolvedPath}`);
            for (const [key, value] of Object.entries(options?.params?.query ?? {})) {
                url.searchParams.set(key, String(value));
            }

            const response = await fetch(url, {
                headers: {
                    accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                signal: AbortSignal.timeout(8_000),
            });
            const body: unknown = await response.json().catch(() => undefined);
            if (!response.ok) {
                return { error: body ?? new Error(`TMDB request failed with ${response.status}`) };
            }

            const parsed = tmdbPayload.safeParse(body);
            return parsed.success ? { data: parsed.data as TmdbResponse } : { error: parsed.error };
        },
    };
}

export function imageUrl(path: string, size = 'original') {
    return `https://image.tmdb.org/t/p/${size}${path}`;
}
