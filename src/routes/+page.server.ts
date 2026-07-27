import { error, fail } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import { Effect, Either } from 'effect';

import { formatAudioLabel } from '$lib/anime';
import type { MediaSeason } from '$lib/graphql/anilist/generated/graphql';
import { anime } from '$lib/server/anime';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import {
    getWatchlistedAnimeIds,
    togglePlanToWatch,
} from '$lib/server/watchlist';
import type { Actions, PageServerLoad } from './$types';

const userCookie = 'arc_user';

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

function cookieUserId(value: string | undefined) {
    return value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        )
        ? value
        : undefined;
}

function animeId(value: FormDataEntryValue | null) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = async ({ cookies }) => {
    const { season, year } = currentSeason();
    const result = await Effect.runPromise(
        anime.anilist.getHomepage(season, year).pipe(Effect.either),
    );

    if (Either.isLeft(result)) error(502, result.left.message);

    const highlightIds = result.right.highlights.map(({ id }) => id);
    const seasonIds = result.right.season.map(({ id }) => id);
    const animeIds = [...new Set([...highlightIds, ...seasonIds])];
    const audioIds = animeIds;
    const [storedMedia, episodeRows, popularAudio, watchlisted] =
        await Promise.all([
            Promise.all(
                highlightIds.map((id) =>
                    anime.tmdb.getStoredMedia(id).catch(() => null),
                ),
            ),
            audioIds.length
                ? db
                      .select({
                          anilistId: animeEpisode.anilistId,
                          episodeId: animeEpisode.episodeId,
                          audio: animeEpisode.audio,
                      })
                      .from(animeEpisode)
                      .where(inArray(animeEpisode.anilistId, audioIds))
                      .orderBy(asc(animeEpisode.number))
                : [],
            anime.allanime.getPopularAudioLabels().catch(() => new Map()),
            getWatchlistedAnimeIds(
                cookieUserId(cookies.get(userCookie)),
                animeIds,
            ),
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
        if (firstEpisodeHrefByAnime.has(episode.anilistId)) continue;

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
                imageUrl:
                    artwork?.selectedBackdrop?.url ?? highlight.imageUrl,
                logoUrl: artwork?.selectedLogo?.url ?? null,
                logoSize: artwork?.logoSize ?? 100,
                audioLabel: formatAudioLabel([
                    ...(audioByAnime.get(highlight.id) ?? []),
                ]),
                href: `/anime/${highlight.id}`,
                playHref:
                    firstEpisodeHrefByAnime.get(highlight.id) ??
                    `/anime/${highlight.id}`,
            };
        }),
        season: result.right.season.map((card) => ({
            ...card,
            secondaryLabel: formatAudioLabel([
                ...(audioByAnime.get(card.id) ?? []),
                ...(popularAudio.get(card.id) ?? []),
            ]),
        })),
        watchlistedIds: [...watchlisted],
    };
};

export const actions: Actions = {
    watchlist: async ({ cookies, request }) => {
        const form = await request.formData();
        const id = animeId(form.get('animeId'));
        if (!id) return fail(400, { message: 'Invalid anime ID' });

        const currentUserId = cookieUserId(cookies.get(userCookie));
        const userId = currentUserId ?? crypto.randomUUID();

        try {
            const state = await togglePlanToWatch(userId, id);

            if (!currentUserId) {
                cookies.set(userCookie, userId, {
                    path: '/',
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: !import.meta.env.DEV,
                    maxAge: 60 * 60 * 24 * 365,
                });
            }

            return { success: true, state };
        } catch (cause) {
            return fail(500, {
                message:
                    cause instanceof Error
                        ? cause.message
                        : 'Watchlist update failed',
            });
        }
    },
};
