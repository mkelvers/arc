import { error, json } from '@sveltejs/kit';

import { availableAnimeSeasons, compareAnimeSeasons, currentAnimeSeason } from '$lib/anime/season';
import { getSimulcastSeasonStarts } from '$lib/server/anime/anilist/simulcast';
import { requestedSimulcastSeason, simulcastPage } from '$lib/server/anime/simulcast';
import { positiveInteger } from '$lib/utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const current = currentAnimeSeason();
    const selected = requestedSimulcastSeason(url.searchParams, current);
    const page = positiveInteger(url.searchParams.get('page'));
    if (!selected || !page) {
        error(400, 'A valid season, year, and page are required');
    }
    if (compareAnimeSeasons(selected, current) > 0) {
        error(404, 'That simulcast season is not available yet');
    }

    const starts = await getSimulcastSeasonStarts().catch((cause) => {
        console.error('Simulcast season range load failed', cause);
        error(502, 'Simulcast could not be loaded');
    });
    if (
        !availableAnimeSeasons(starts, current).some(
            (option) => option.season === selected.season && option.year === selected.year
        )
    ) {
        error(404, 'That simulcast season is not available');
    }

    try {
        return json(await simulcastPage(selected, page));
    } catch (cause) {
        console.error(
            `Simulcast ${selected.season} ${selected.year} page ${page} load failed`,
            cause
        );
        error(502, 'More simulcast releases could not be loaded');
    }
};
