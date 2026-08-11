import { error, fail, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { currentAnimeSeason } from '$lib/anime/season';
import { getHomepage } from '$lib/server/anime/anilist/home';
import { getPopularAudioLabels } from '$lib/server/anime/allanime/catalog';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { getHomeHero } from '$lib/server/anime/home';
import { animeId } from '$lib/server/anime/route';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { getContinueWatchingCards } from '$lib/server/playback-progress/home';
import { deletePlaybackProgress } from '$lib/server/playback-progress/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const { season, year } = currentAnimeSeason();
    const continueWatching = getContinueWatchingCards(locals.user?.id).catch((cause) => {
        console.error('Continue watching load failed', cause);
        return [];
    });
    const highlights = getHomeHero().catch((cause) => {
        console.error('Homepage hero load failed', cause);
        return [];
    });
    const homepage = await getHomepage(season, year).catch((cause) => {
        console.error('Homepage catalog load failed', cause);
        error(502, 'The home page could not be loaded');
    });

    const animeIds = [...new Set([...homepage.season, ...homepage.popular].map(({ id }) => id))];
    const [homeHero, episodeRows, popularAudio] = await Promise.all([
        highlights,
        animeIds.length
            ? db
                  .select({
                      anilistId: animeEpisode.anilistId,
                      audio: animeEpisode.audio,
                  })
                  .from(animeEpisode)
                  .where(inArray(animeEpisode.anilistId, animeIds))
            : [],
        getPopularAudioLabels().catch(() => new Map()),
    ]);
    const audioByAnime = new Map<number, Set<'sub' | 'dub' | 'raw'>>();

    for (const episode of episodeRows) {
        const audio = audioByAnime.get(episode.anilistId) ?? new Set<'sub' | 'dub' | 'raw'>();
        episode.audio.forEach((mode) => audio.add(mode));
        audioByAnime.set(episode.anilistId, audio);
    }

    const withAudio = (card: (typeof homepage.season)[number]) => ({
        ...card,
        audioLabel: audioAvailabilityLabel([
            ...(audioByAnime.get(card.id) ?? []),
            ...(popularAudio.get(card.id) ?? []),
        ]),
    });

    const seasonCards = homepage.season.map(withAudio);
    const cards = await enrichAnimeCards([...seasonCards, ...homepage.popular.map(withAudio)]);

    return {
        pageTitle: 'Watch anime',
        highlights: homeHero,
        season: cards.slice(0, seasonCards.length),
        popular: cards.slice(seasonCards.length),
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
