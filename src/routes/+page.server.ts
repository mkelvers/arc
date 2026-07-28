import { error } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import { Effect, Either } from 'effect';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import type { MediaSeason } from '$lib/graphql/anilist/generated/graphql';
import { anime } from '$lib/server/anime';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { updateWatchlist } from '$lib/server/watchlist/action';
import {
    getWatchlistedAnimeIds,
} from '$lib/server/watchlist/store';
import type { Actions, PageServerLoad } from './$types';

function currentSeason(now = new Date()) {
    const month = now.getUTCMonth() + 1;
    const season: MediaSeason =
        month <= 3
            ? 'WINTER'
            : month <= 6
              ? 'SPRING'
              : month <= 9
                ? 'SUMMER'
                : 'FALL';

    return {
        season,
        year: now.getUTCFullYear(),
    };
}

export const load: PageServerLoad = async ({ locals }) => {
    const { season, year } = currentSeason();
    const result = await Effect.runPromise(
        anime.anilist.getHomepage(season, year).pipe(Effect.either),
    );

    if (Either.isLeft(result)) {
        error(502, result.left.message);
    }

    const highlightIds = result.right.highlights.map(({ id }) => id);
    const seasonIds = result.right.season.map(({ id }) => id);
    const animeIds = [...new Set([...highlightIds, ...seasonIds])];
    const [storedMedia, episodeRows, popularAudio, watchlisted] =
        await Promise.all([
            Promise.all(
                highlightIds.map((id) =>
                    anime.tmdb.getStoredMedia(id).catch(() => null),
                ),
            ),
            animeIds.length
                ? db
                      .select({
                          anilistId: animeEpisode.anilistId,
                          episodeId: animeEpisode.episodeId,
                          audio: animeEpisode.audio,
                      })
                      .from(animeEpisode)
                      .where(inArray(animeEpisode.anilistId, animeIds))
                      .orderBy(asc(animeEpisode.number))
                : [],
            anime.allanime.getPopularAudioLabels().catch(() => new Map()),
            getWatchlistedAnimeIds(locals.user?.id, animeIds),
        ]);
    const audioByAnime = new Map<number, Set<'sub' | 'dub' | 'raw'>>();

    for (const episode of episodeRows) {
        const audio =
            audioByAnime.get(episode.anilistId) ??
            new Set<'sub' | 'dub' | 'raw'>();
        episode.audio.forEach((mode) => audio.add(mode));
        audioByAnime.set(episode.anilistId, audio);
    }

    const firstEpisodeHrefByAnime = new Map<number, string>();
    for (const episode of episodeRows) {
        if (firstEpisodeHrefByAnime.has(episode.anilistId)) {
            continue;
        }

        firstEpisodeHrefByAnime.set(
            episode.anilistId,
            `/anime/${episode.anilistId}/watch/${encodeURIComponent(episode.episodeId)}`,
        );
    }

    return {
        highlights: result.right.highlights.map((highlight, index) => {
            const artwork = storedMedia[index]?.artwork;

            return {
                ...highlight,
                image:
                    artwork?.selectedBackdrop?.url ?? highlight.image,
                logoUrl: artwork?.selectedLogo?.url ?? null,
                logoSize: artwork?.logoSize ?? 100,
                audioLabel: audioAvailabilityLabel([
                    ...(audioByAnime.get(highlight.id) ?? []),
                ]),
                href: `/anime/${highlight.id}`,
                watchHref:
                    firstEpisodeHrefByAnime.get(highlight.id) ??
                    `/anime/${highlight.id}`,
            };
        }),
        season: result.right.season.map((card) => ({
            ...card,
            caption: audioAvailabilityLabel([
                ...(audioByAnime.get(card.id) ?? []),
                ...(popularAudio.get(card.id) ?? []),
            ]),
        })),
        watchlistedIds: [...watchlisted],
    };
};

export const actions: Actions = {
    watchlist: updateWatchlist,
};
