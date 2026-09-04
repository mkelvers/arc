import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';

import type { AnimeCard } from '../types';
import { audioAvailabilityLabel, type AudioMode } from '../audio';
import { currentAnimeSeason } from '../season';
import { db } from '@arc/shared/db';
import {
    animeCatalog,
    animeEpisode,
    homeHeroCandidate,
    homeHeroSelection,
} from '@arc/shared/db/schema';
import {
    homeHeroRotationStart,
    rotatedHomeHeroCandidates,
    selectHomeHero,
    type HomeHeroCandidate,
} from './home-selection';
import type { CatalogSource, HomeHero } from './source';

function audioModes(rows: Array<{ anilistId: number; audio: AudioMode[] }>) {
    const modes = new Map<number, Set<AudioMode>>();
    for (const row of rows) {
        const animeModes = modes.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => animeModes.add(mode));
        modes.set(row.anilistId, animeModes);
    }
    return modes;
}

async function heroSelection(rotationStart: string, loadHomeHero: CatalogSource['loadHomeHero']) {
    async function selectionForRotation(rotation: string) {
        return db
            .select({ anilistId: homeHeroSelection.anilistId })
            .from(homeHeroSelection)
            .where(eq(homeHeroSelection.rotationStart, rotation))
            .orderBy(asc(homeHeroSelection.position))
            .then((rows) => rows.map(({ anilistId }) => anilistId));
    }

    async function previousSelection() {
        const rotations = await db
            .select({ rotationStart: homeHeroSelection.rotationStart })
            .from(homeHeroSelection)
            .where(lt(homeHeroSelection.rotationStart, rotationStart))
            .groupBy(homeHeroSelection.rotationStart)
            .orderBy(desc(homeHeroSelection.rotationStart))
            .limit(4);
        const selections = await Promise.all(
            rotations.map(({ rotationStart: previous }) => selectionForRotation(previous))
        );
        return {
            previous: selections[0] ?? [],
            recent: selections.flat(),
        };
    }

    async function hydrate(ids: number[]) {
        return selectHomeHero(
            ids.map((anilistId, index) => ({
                anilistId,
                averageScore: 0,
                trendingRank: index + 1,
            })),
            loadHomeHero
        );
    }

    async function buildSelection() {
        const [candidateRows, history] = await Promise.all([
            db
                .select({
                    anilistId: homeHeroCandidate.anilistId,
                    averageScore: homeHeroCandidate.averageScore,
                    trendingRank: homeHeroCandidate.trendingRank,
                })
                .from(homeHeroCandidate)
                .orderBy(asc(homeHeroCandidate.trendingRank)),
            previousSelection(),
        ]);
        const candidates: HomeHeroCandidate[] = candidateRows;
        const selected = await selectHomeHero(
            rotatedHomeHeroCandidates(candidates, history.previous, history.recent),
            loadHomeHero
        );
        if (selected.length < 6) {
            throw new Error(
                `Only ${selected.length} releasing anime had complete hero artwork and an available episode`
            );
        }

        await db
            .insert(homeHeroSelection)
            .values(
                selected.map(({ id }, position) => ({
                    rotationStart,
                    position,
                    anilistId: id,
                }))
            )
            .onConflictDoNothing();

        const stored = await selectionForRotation(rotationStart);
        const selectedById = new Map(selected.map((anime) => [anime.id, anime]));
        const ordered = stored.flatMap((id) => {
            const anime = selectedById.get(id);
            return anime ? [anime] : [];
        });
        return stored.length === 6 && ordered.length === 6 ? ordered : hydrate(stored);
    }

    const stored = await selectionForRotation(rotationStart);
    if (stored.length === 6) {
        return hydrate(stored);
    }

    try {
        return await buildSelection();
    } catch (cause) {
        const { previous } = await previousSelection();
        if (previous.length) {
            return hydrate(previous);
        }
        throw cause;
    }
}

export async function homePage(source: CatalogSource, userId: string, now = new Date()) {
    const { season, year } = currentAnimeSeason(now);
    const [seasonRows, popularRows] = await Promise.all([
        db
            .select()
            .from(animeCatalog)
            .where(
                and(
                    eq(animeCatalog.season, season),
                    eq(animeCatalog.seasonYear, year),
                    inArray(animeCatalog.status, ['RELEASING', 'FINISHED'])
                )
            )
            .orderBy(desc(animeCatalog.popularity), desc(animeCatalog.averageScore))
            .limit(24),
        db
            .select()
            .from(animeCatalog)
            .where(inArray(animeCatalog.status, ['RELEASING', 'FINISHED']))
            .orderBy(desc(animeCatalog.popularity), desc(animeCatalog.averageScore))
            .limit(24),
    ]);
    const animeIds = [
        ...new Set([...seasonRows, ...popularRows].map(({ anilistId }) => anilistId)),
    ];
    const [episodeRows, highlights, continueWatching] = await Promise.all([
        animeIds.length
            ? db
                  .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
                  .from(animeEpisode)
                  .where(inArray(animeEpisode.anilistId, animeIds))
            : Promise.resolve([]),
        heroSelection(homeHeroRotationStart(now), source.loadHomeHero).catch(() => []),
        source.continueWatching(userId).catch(() => []),
    ]);
    const audioByAnime = audioModes(episodeRows);
    const toCard = (row: (typeof seasonRows)[number]): AnimeCard => ({
        id: row.anilistId,
        href: `/anime/${row.anilistId}`,
        link: `/anime/${row.anilistId}`,
        title: row.title,
        image: row.imageUrl,
        audioLabel: audioAvailabilityLabel([...(audioByAnime.get(row.anilistId) ?? [])]),
        format: row.format,
        status: row.status,
        score: row.averageScore ?? 0,
        genres: row.genres,
        synopsis: row.synopsis,
    });
    const seasonCards = seasonRows.map(toCard);
    const cards = await source.enrichAnimeCards([...seasonCards, ...popularRows.map(toCard)]);

    return {
        highlights,
        season: cards.slice(0, seasonCards.length),
        popular: cards.slice(seasonCards.length),
        continueWatching,
    };
}

export type { HomeHero } from './source';
