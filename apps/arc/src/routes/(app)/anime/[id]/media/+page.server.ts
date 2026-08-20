import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';

import { toAnimeDetails } from '$lib/server/anime/details';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { getArtwork } from '$lib/server/anime/tmdb/artwork';
import {
    getStoredMedia,
    refreshArtwork,
    selectArtwork,
    setLogoSize,
} from '$lib/server/anime/tmdb/media';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }

    const stored = await getStoredMedia(id).catch((cause) => {
        console.error(`Stored TMDB media read failed for AniList ${id}`, cause);
        return null;
    });

    if (stored) {
        return {
            ...stored,
        };
    }

    const result = await loadAnime(id);
    const details = toAnimeDetails(result);

    try {
        const artwork = await getArtwork(result);

        return {
            anime: details,
            artwork,
        };
    } catch (cause) {
        console.error(`TMDB artwork enrichment failed for AniList ${id}`, cause);
        return {
            anime: details,
            artwork: null,
        };
    }
};

export const actions: Actions = {
    default: async ({ params, request }) => {
        const data = await request.formData();
        const intent = data.get('intent');
        const id = animeId(params.id);
        if (!id) {
            error(400, 'Invalid anime ID');
        }

        if (intent === 'refresh') {
            try {
                await refreshArtwork(id);
                return { success: true };
            } catch (cause) {
                return fail(502, {
                    message: cause instanceof Error ? cause.message : 'Artwork refresh failed',
                });
            }
        }

        if (intent === 'logoSize') {
            const logoSize = Number(data.get('logoSize'));

            try {
                await setLogoSize(id, logoSize);
                return { success: true };
            } catch (cause) {
                return fail(400, {
                    message: cause instanceof Error ? cause.message : 'Logo size update failed',
                });
            }
        }

        const type = data.get('type');
        const value = data.get('filePath');

        if (type !== 'backdrop' && type !== 'logo') {
            return fail(400, { message: 'Invalid artwork type' });
        }
        const parsedValue = z.string().safeParse(value);
        if (!parsedValue.success) {
            return fail(400, { message: 'Invalid artwork selection' });
        }

        try {
            await selectArtwork(id, type, parsedValue.data === '' ? null : parsedValue.data);
            return { success: true };
        } catch (cause) {
            return fail(400, {
                message: cause instanceof Error ? cause.message : 'Selection failed',
            });
        }
    },
};
