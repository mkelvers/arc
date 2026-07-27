import { eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { anime as animeTable } from '$lib/server/db/schema';
import { create } from './client';
import { findMapping, saveMapping } from './mapping-store';
import {
    candidateScore,
    isSpecialRelease,
    mappingTitles,
    seriesTitle,
    titlesFor,
} from './title';
import {
    mappingVersion,
    type AniListAnime,
    type Candidate,
    type Mapping,
    type StoredMapping,
} from './types';

async function searchTv(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/tv', {
        params: { query: { query, include_adult: false } },
    });

    if (!data) {
        throw new Error('TMDB TV search failed', { cause: error });
    }

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'tv' as const,
                      name: result.name ?? '',
                      originalName: result.original_name ?? '',
                      date: result.first_air_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : [],
    );
}

async function searchMovies(query: string): Promise<Candidate[]> {
    const { data, error } = await create().GET('/3/search/movie', {
        params: { query: { query, include_adult: false } },
    });

    if (!data) {
        throw new Error('TMDB movie search failed', { cause: error });
    }

    return (data.results ?? []).flatMap((result) =>
        result.id
            ? [
                  {
                      id: result.id,
                      mediaType: 'movie' as const,
                      name: result.title ?? '',
                      originalName: result.original_title ?? '',
                      date: result.release_date ?? null,
                      popularity: result.popularity ?? 0,
                  },
              ]
            : [],
    );
}

export async function resolveStored(
    anime: AniListAnime,
): Promise<StoredMapping> {
    const stored = await findMapping(anime.id);

    if (stored?.mappingVersion === mappingVersion) {
        await db
            .update(animeTable)
            .set({
                title: titlesFor(anime)[0] ?? null,
                updatedAt: new Date(),
            })
            .where(eq(animeTable.id, stored.animeId));

        return stored;
    }

    const relatedMappings = (
        await Promise.all(
            (anime.relations?.edges ?? []).flatMap((edge) =>
                edge?.node?.type === 'ANIME' &&
                (edge.relationType === 'PREQUEL' ||
                    edge.relationType === 'SEQUEL' ||
                    (isSpecialRelease(anime) &&
                        edge.relationType === 'PARENT'))
                    ? [findMapping(edge.node.id)]
                    : [],
            ),
        )
    ).filter((mapping): mapping is StoredMapping => mapping !== null);
    const related = [
        ...new Map(
            relatedMappings.map((mapping) => [
                `${mapping.mediaType}:${mapping.id}`,
                mapping,
            ]),
        ).values(),
    ];
    const titles = mappingTitles(anime);

    if (!titles.length) {
        throw new Error('AniList returned no searchable title');
    }

    const search = anime.format === 'MOVIE' ? searchMovies : searchTv;
    const queries = [
        ...new Set(titles.flatMap((title) => [title, seriesTitle(title)])),
    ];
    const candidates = (
        await Promise.all(queries.map((title) => search(title)))
    ).flat();
    const unique = [
        ...new Map(
            candidates.map((candidate) => [
                `${candidate.mediaType}:${candidate.id}`,
                candidate,
            ]),
        ).values(),
    ];
    const match = unique.sort(
        (left, right) =>
            candidateScore(right, anime) - candidateScore(left, anime),
    )[0];

    // Missing enrichment is safer than attaching art and episodes from a
    // similarly named release, so only persist a confident search result.
    if (match && candidateScore(match, anime) >= 85) {
        return saveMapping(anime, {
            id: match.id,
            mediaType: match.mediaType,
        });
    }

    if (related.length === 1) {
        return saveMapping(anime, {
            id: related[0].id,
            mediaType: related[0].mediaType,
        });
    }

    throw new Error(`No confident TMDB match for AniList ${anime.id}`);
}

export async function resolve(anime: AniListAnime): Promise<Mapping> {
    const { id, mediaType } = await resolveStored(anime);

    return { id, mediaType };
}
