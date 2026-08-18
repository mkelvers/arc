import { error, fail, redirect } from '@sveltejs/kit';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { currentAnimeSeason } from '$lib/anime/season';
import { getHomepage } from '$lib/server/anime/anilist/home';
import { getPopularAudioLabels } from '$lib/server/anime/allanime/catalog';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { storedAudioModes } from '$lib/server/anime/episodes/model';
import { getHomeHero } from '$lib/server/anime/home';
import { animeId } from '$lib/server/anime/route';
import { getContinueWatchingCards } from '$lib/server/playback-progress/home';
import { dismissPlaybackProgress } from '$lib/server/playback-progress/store';
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
    const [homeHero, audioByAnime, popularAudio] = await Promise.all([
        highlights,
        storedAudioModes(animeIds),
        getPopularAudioLabels().catch(() => new Map()),
    ]);
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
            await dismissPlaybackProgress(locals.user.id, id);
            return { success: true };
        } catch (cause) {
            console.error('Failed to remove continue watching', cause);
            return fail(500, {
                message: 'Failed to remove continue watching',
            });
        }
    },
};
