import { asc, desc, eq, lt } from 'drizzle-orm';

import { audioAvailabilityLabel } from '@arc/core';
import { db } from '@arc/shared/db';
import { homeHeroSelection } from '@arc/shared/db/schema';
import { getHomeHeroCandidates } from './anilist/hero';
import { storedAnimeRelease } from './anilist/releases';
import { mediaTitle } from '@arc/core';
import { isDiscoverableAnime } from '@arc/core';
import { getEpisodes } from './episodes';
import { logger } from '@arc/backend/internal/logger';
import { resolveHeroSynopsis } from './synopsis';
import {
    homeHeroRotationStart,
    rotatedHomeHeroCandidates,
    selectHomeHero,
} from '@arc/core';
import { getArtwork } from './tmdb/artwork';

interface HomeHeroAnime {
    id: number;
    href: string;
    link: string;
    episodeLabel: string;
    title: string;
    image: string;
    logo: {
        url: string;
        size: number;
    };
    audioLabel: string;
    genres: string[];
    description: string;
}

async function selectionForRotation(rotationStart: string) {
    return db
        .select({ anilistId: homeHeroSelection.anilistId })
        .from(homeHeroSelection)
        .where(eq(homeHeroSelection.rotationStart, rotationStart))
        .orderBy(asc(homeHeroSelection.position))
        .then((rows) => rows.map(({ anilistId }) => anilistId));
}

async function previousSelection(rotationStart: string) {
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

async function eligibleHero(id: number): Promise<HomeHeroAnime | null> {
    try {
        const details = await storedAnimeRelease(id);
        if (!details) {
            return null;
        }
        if (!isDiscoverableAnime(details)) {
            return null;
        }

        // Hero selection checks many candidates; artwork is prefetched by the catalog scheduler.
        // Do not turn one home request into a TMDB request fan-out when stored artwork is missing.
        const artwork = await getArtwork(details, { fetchMissing: false });

        if (!artwork?.selectedBackdrop || !artwork.selectedLogo) {
            return null;
        }

        const episodes = await getEpisodes(details);
        const firstEpisode = episodes[0];
        if (!firstEpisode) {
            return null;
        }

        return {
            id,
            href: `/anime/${id}`,
            link: firstEpisode.href,
            episodeLabel: firstEpisode.label,
            title: mediaTitle(details),
            image: artwork.selectedBackdrop.url,
            logo: {
                url: artwork.selectedLogo.url,
                size: artwork.logoSize,
            },
            audioLabel: audioAvailabilityLabel([
                ...new Set(episodes.flatMap(({ audio }) => audio)),
            ]),
            genres: details.genres?.filter((genre) => genre !== null) ?? [],
            description: await resolveHeroSynopsis(details),
        };
    } catch (cause) {
        logger.debug(`Homepage hero candidate ${id} failed`, cause);
        return null;
    }
}

async function hydrate(ids: number[]) {
    return selectHomeHero(
        ids.map((anilistId, index) => ({
            anilistId,
            averageScore: 0,
            trendingRank: index + 1,
        })),
        eligibleHero
    );
}

async function buildSelection(rotationStart: string) {
    const [candidates, history] = await Promise.all([
        getHomeHeroCandidates(),
        previousSelection(rotationStart),
    ]);
    const selected = await selectHomeHero(
        rotatedHomeHeroCandidates(candidates, history.previous, history.recent),
        eligibleHero
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

async function loadHomeHero(rotationStart: string) {
    const stored = await selectionForRotation(rotationStart);
    if (stored.length === 6) {
        return hydrate(stored);
    }

    try {
        return await buildSelection(rotationStart);
    } catch (cause) {
        const { previous } = await previousSelection(rotationStart);
        if (previous.length) {
            logger.debug(
                `Homepage hero rotation failed; using ${previous.length} previous selections`,
                cause
            );
            return hydrate(previous);
        }

        throw cause;
    }
}

export function getHomeHero(now = new Date()) {
    const rotationStart = homeHeroRotationStart(now);
    return loadHomeHero(rotationStart);
}
