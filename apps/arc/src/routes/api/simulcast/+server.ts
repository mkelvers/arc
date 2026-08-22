import { error } from '@sveltejs/kit';

import { availableAnimeSeasons, compareAnimeSeasons, currentAnimeSeason } from '@arc/shared/season';
import { getSimulcastSeasonStarts } from '@arc/backend/internal/anime/anilist/simulcast';
import { requestedSimulcastSeason, simulcastPage } from '@arc/backend/internal/anime/simulcast';
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

    const starts = await getSimulcastSeasonStarts().catch(() =>
        error(502, 'Simulcast could not be loaded')
    );
    if (
        !availableAnimeSeasons(starts, current).some(
            ({ season, year }) => season === selected.season && year === selected.year
        )
    ) {
        error(404, 'That simulcast season is not available');
    }

    return Response.json(
        await simulcastPage(selected, page).catch(() =>
            error(502, 'More simulcast releases could not be loaded')
        )
    );
};
