import { and, arrayContains, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BrowseFilters } from '@arc/shared/browse';
import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeCard } from '@arc/shared/types';
import { db } from '@arc/db';
import { animeCatalog, animeEpisode } from '@arc/db/schema';

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
}

function hasAudio(mode: AudioMode) {
    return sql<boolean>`exists (
        select 1
        from ${animeEpisode}
        where ${animeEpisode.anilistId} = ${animeCatalog.anilistId}
          and cast(${mode} as episode_audio) = any(${animeEpisode.audio})
    )`;
}

function catalogConditions(filters: BrowseFilters) {
    return and(
        filters.query
            ? sql`${animeCatalog.searchText} ilike ${`%${escapeLike(filters.query)}%`} escape '\\'`
            : undefined,
        filters.format === 'MOVIE'
            ? eq(animeCatalog.format, 'MOVIE')
            : inArray(animeCatalog.format, ['TV', 'ONA']),
        sql`${animeCatalog.popularity} >= 2000`,
        sql`(${animeCatalog.duration} is null or ${animeCatalog.duration} >= 15)`,
        eq(animeCatalog.discoveryRevision, 2),
        filters.safe ? eq(animeCatalog.isAdult, false) : undefined,
        filters.genre ? arrayContains(animeCatalog.genres, [filters.genre]) : undefined,
        filters.tag ? arrayContains(animeCatalog.tags, [filters.tag]) : undefined,
        filters.status ? eq(animeCatalog.status, filters.status) : undefined,
        filters.format && filters.format !== 'MOVIE'
            ? eq(animeCatalog.format, filters.format)
            : undefined,
        filters.source ? eq(animeCatalog.source, filters.source) : undefined,
        filters.season ? eq(animeCatalog.season, filters.season) : undefined,
        filters.year ? eq(animeCatalog.seasonYear, filters.year) : undefined,
        filters.country ? eq(animeCatalog.countryOfOrigin, filters.country) : undefined,
        filters.audio === 'dub' ? hasAudio('dub') : undefined,
        filters.audio === 'sub' ? hasAudio('sub') : undefined
    );
}

function catalogOrder(filters: BrowseFilters) {
    const popularityDescending = sql`${animeCatalog.popularity} desc nulls last`;
    const titleAscending = sql`${animeCatalog.title} asc`;

    if (filters.sort === 'score') {
        return [
            filters.order === 'asc'
                ? sql`${animeCatalog.averageScore} asc nulls last`
                : sql`${animeCatalog.averageScore} desc nulls last`,
            popularityDescending,
            titleAscending,
            asc(animeCatalog.anilistId),
        ];
    }

    return [
        filters.order === 'asc'
            ? sql`${animeCatalog.popularity} asc nulls last`
            : popularityDescending,
        titleAscending,
        asc(animeCatalog.anilistId),
    ];
}

function audioModes(row: { hasSub: boolean; hasDub: boolean; hasRaw: boolean }) {
    const modes: AudioMode[] = [];
    if (row.hasSub) {
        modes.push('sub');
    }
    if (row.hasDub) {
        modes.push('dub');
    }
    if (row.hasRaw) {
        modes.push('raw');
    }
    return modes;
}

export async function catalogPage(filters: BrowseFilters, page: number, animeIds: number[] | null) {
    if (animeIds?.length === 0) {
        return { anime: [], hasNextPage: false };
    }

    const rows = await db
        .select({
            id: animeCatalog.anilistId,
            title: animeCatalog.title,
            image: animeCatalog.imageUrl,
            score: animeCatalog.averageScore,
            genres: animeCatalog.genres,
            synopsis: animeCatalog.synopsis,
            hasSub: hasAudio('sub'),
            hasDub: hasAudio('dub'),
            hasRaw: hasAudio('raw'),
        })
        .from(animeCatalog)
        .where(
            and(
                catalogConditions(filters),
                animeIds ? inArray(animeCatalog.anilistId, animeIds) : undefined
            )
        )
        .orderBy(...catalogOrder(filters))
        .limit(43)
        .offset(animeIds ? 0 : (page - 1) * 42);

    const orderedRows = animeIds
        ? animeIds.flatMap((id) => {
              const row = rows.find((candidate) => candidate.id === id);
              return row ? [row] : [];
          })
        : rows;

    const anime: AnimeCard[] = orderedRows.slice(0, 42).map((row) => ({
        id: row.id,
        href: `/anime/${row.id}`,
        link: `/anime/${row.id}`,
        title: row.title,
        image: row.image,
        audioLabel: audioAvailabilityLabel(audioModes(row)),
        score: row.score ?? 0,
        genres: row.genres,
        synopsis: row.synopsis,
    }));

    return {
        anime,
        hasNextPage: orderedRows.length > 42,
    };
}
