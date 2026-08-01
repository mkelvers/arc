import { error, fail, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import { Effect, Either } from 'effect';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import type { MediaSeason } from '$lib/graphql/anilist/generated/graphql';
import { anime } from '$lib/server/anime';
import { animeId } from '$lib/server/anime/route';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { getContinueWatchingCards } from '$lib/server/playback-progress/home';
import { deletePlaybackProgress } from '$lib/server/playback-progress/store';
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
    const continueWatching = getContinueWatchingCards(
        locals.user?.id,
    ).catch((cause) => {
        console.error('Continue watching load failed', cause);
        return [];
    });
    const highlights = anime.getHomeHero().catch((cause) => {
        console.error('Homepage hero load failed', cause);
        return [];
    });
    const result = await Effect.runPromise(
        anime.anilist.getHomepage(season, year).pipe(Effect.either),
    );

    if (Either.isLeft(result)) {
        error(502, result.left.message);
    }

    const seasonIds = result.right.season.map(({ id }) => id);
    const [homeHero, episodeRows, popularAudio] = await Promise.all([
        highlights,
        seasonIds.length
            ? db
                  .select({
                      anilistId: animeEpisode.anilistId,
                      audio: animeEpisode.audio,
                  })
                  .from(animeEpisode)
                  .where(inArray(animeEpisode.anilistId, seasonIds))
            : [],
        anime.allanime.getPopularAudioLabels().catch(() => new Map()),
    ]);
    const audioByAnime = new Map<number, Set<'sub' | 'dub' | 'raw'>>();

    for (const episode of episodeRows) {
        const audio =
            audioByAnime.get(episode.anilistId) ??
            new Set<'sub' | 'dub' | 'raw'>();
        episode.audio.forEach((mode) => audio.add(mode));
        audioByAnime.set(episode.anilistId, audio);
    }

    return {
        highlights: homeHero,
        season: result.right.season.map((card) => ({
            ...card,
            caption: audioAvailabilityLabel([
                ...(audioByAnime.get(card.id) ?? []),
                ...(popularAudio.get(card.id) ?? []),
            ]),
        })),
        continueWatching,
    };
};

export const actions: Actions = {
    removeContinueWatching: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        const id = animeId(form.get('animeId'));

        if (!id) {
            return fail(400, { message: 'Invalid anime ID' });
        }

        try {
            await deletePlaybackProgress(locals.user.id, id);
            return { success: true };
        } catch (cause) {
            console.error('Failed to remove continue watching', cause);
            return fail(500, {
                message: 'Failed to remove continue watching',
            });
        }
    },
};
