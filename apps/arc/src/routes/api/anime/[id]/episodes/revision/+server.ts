import { json } from '@sveltejs/kit';

import { getEpisodeRevision } from '@arc/backend/internal/anime/episodes';
import { animeId } from '$lib/server/anime/route';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
    const id = animeId(params.id);
    if (!id) {
        return json({ message: 'Invalid anime ID' }, { status: 400 });
    }

    setHeaders({ 'Cache-Control': 'no-store' });

    return json({
        revision: await getEpisodeRevision(id),
    });
};
