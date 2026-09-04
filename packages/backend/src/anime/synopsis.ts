import { eq } from 'drizzle-orm';

import type { AnimeCard } from '@arc/core';
import { db } from '@arc/shared/db';
import { animeSynopsis } from '@arc/shared/db/schema';
import { logger } from '@arc/backend/internal/logger';
import { getAnimeRelease, storedAnimeRelease } from './anilist/releases';
import { mediaTitle, plainText } from '@arc/core';
import type { AniListAnime } from '@arc/core';
import { create } from './tmdb/client';
import { NoConfidentTmdbMappingError, resolveStored } from './tmdb/mapping';
import {
    earliestRelease,
    informativeHeroSynopsis,
    isSeasonReleaseTitle,
    isSeasonPlaceholderSynopsis,
    minimumInformativeHeroSynopsisLength,
} from './synopsis/selection';

function usefulSynopsis(value: string | null | undefined) {
    const synopsis = value?.trim() ?? '';
    return synopsis && !isSeasonPlaceholderSynopsis(synopsis) ? synopsis : null;
}

async function firstRelease(anime: AniListAnime, refresh = false) {
    const visited = new Set<number>();
    let current = anime;

    for (let depth = 0; depth < 12; depth += 1) {
        visited.add(current.id);
        const ids = (current.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType === 'PREQUEL' &&
            edge.node?.type === 'ANIME' &&
            !visited.has(edge.node.id)
                ? [edge.node.id]
                : []
        );
        if (!ids.length) {
            return current;
        }

        const prequels = await Promise.all(
            ids.map((id) => (refresh ? getAnimeRelease(id) : storedAnimeRelease(id)))
        );
        const available = prequels.filter((prequel): prequel is AniListAnime => prequel !== null);
        if (available.length !== prequels.length) {
            return current;
        }
        const earliest = earliestRelease(available);
        if (!earliest) {
            return current;
        }

        current = earliest;
    }

    return current;
}

async function tmdbSynopsis(source: AniListAnime) {
    const mapping = await resolveStored(source, { refresh: true });
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
            synopsis: usefulSynopsis(data.overview),
            sourceAnilistId: source.id,
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

    let synopsis = usefulSynopsis(series.overview);
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
            synopsis = usefulSynopsis(season?.overview);
        }
    }

    return {
        synopsis,
        sourceAnilistId: source.id,
        tmdbExternalIdId: mapping.externalIdId,
    };
}

async function refreshSynopsis(anime: AniListAnime, source: AniListAnime) {
    try {
        const replacement = await tmdbSynopsis(source);
        await db
            .insert(animeSynopsis)
            .values({ anilistId: anime.id, ...replacement, fetchedAt: new Date() })
            .onConflictDoUpdate({
                target: animeSynopsis.anilistId,
                set: {
                    ...replacement,
                    fetchedAt: new Date(),
                },
            });

        return replacement.synopsis;
    } catch (cause) {
        if (cause instanceof NoConfidentTmdbMappingError) {
            logger.debug(`No TMDB synopsis replacement found for AniList ${anime.id}`);
            await db
                .insert(animeSynopsis)
                .values({
                    anilistId: anime.id,
                    synopsis: null,
                    sourceAnilistId: source.id,
                    fetchedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: animeSynopsis.anilistId,
                    set: {
                        synopsis: null,
                        sourceAnilistId: source.id,
                        tmdbExternalIdId: null,
                        fetchedAt: new Date(),
                    },
                });
            return null;
        }

        throw cause;
    }
}

async function resolvedTmdbSynopsis(
    anime: AniListAnime,
    source: AniListAnime,
    options: { refresh?: boolean } = {}
) {
    let stored:
        | { synopsis: string | null; sourceAnilistId: number | null; fetchedAt: Date }
        | undefined;
    try {
        [stored] = await db
            .select({
                synopsis: animeSynopsis.synopsis,
                sourceAnilistId: animeSynopsis.sourceAnilistId,
                fetchedAt: animeSynopsis.fetchedAt,
            })
            .from(animeSynopsis)
            .where(eq(animeSynopsis.anilistId, anime.id))
            .limit(1);
    } catch (cause) {
        logger.debug(`Synopsis record read failed for AniList ${anime.id}`, cause);
    }
    if (
        stored?.sourceAnilistId === source.id &&
        (anime.status === 'FINISHED' ||
            Date.now() - stored.fetchedAt.getTime() < 30 * 24 * 60 * 60 * 1_000)
    ) {
        return stored.synopsis;
    }

    if (!options.refresh) {
        return stored?.sourceAnilistId === source.id ? stored.synopsis : null;
    }

    try {
        return await refreshSynopsis(anime, source);
    } catch (cause) {
        if (stored?.sourceAnilistId === source.id) {
            logger.debug(
                `TMDB synopsis refresh failed for AniList ${anime.id}; using stored text`,
                cause
            );
            return stored.synopsis;
        }

        logger.debug(`TMDB synopsis replacement failed for AniList ${anime.id}`, cause);
        return null;
    }
}

export async function resolveAnimeSynopsis(
    anime: AniListAnime,
    options: { refresh?: boolean } = {}
) {
    const original = plainText(anime.description);
    if (!isSeasonPlaceholderSynopsis(original)) {
        return original;
    }

    return (
        (await resolvedTmdbSynopsis(anime, await firstRelease(anime, options.refresh), options)) ??
        original
    );
}

export async function resolveHeroSynopsis(anime: AniListAnime) {
    const original = plainText(anime.description);
    const needsEarlierRelease =
        isSeasonPlaceholderSynopsis(original) ||
        (original.length < minimumInformativeHeroSynopsisLength &&
            isSeasonReleaseTitle(mediaTitle(anime)));
    const source = needsEarlierRelease ? await firstRelease(anime, true) : anime;
    const replacement = await resolvedTmdbSynopsis(anime, source);
    return informativeHeroSynopsis(replacement ?? '', plainText(source.description) || original);
}

export async function withAnimeCardSynopses<T extends AnimeCard>(cards: T[]) {
    const enriched: T[] = [];

    for (let offset = 0; offset < cards.length; offset += 4) {
        enriched.push(
            ...(await Promise.all(
                cards.slice(offset, offset + 4).map(async (card) => {
                    if (!isSeasonPlaceholderSynopsis(card.synopsis)) {
                        return card;
                    }

                    try {
                        const anime = await getAnimeRelease(card.id);
                        return { ...card, synopsis: await resolveAnimeSynopsis(anime) };
                    } catch (cause) {
                        logger.debug(
                            `Card synopsis replacement failed for AniList ${card.id}`,
                            cause
                        );
                        return card;
                    }
                })
            ))
        );
    }

    return enriched;
}
