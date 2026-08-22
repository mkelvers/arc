import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { SkipIntervalInputSchema, validSkipInterval } from '@arc/backend/internal/anime/aniskip';
import { saveEpisodeSegment } from '@arc/backend/internal/anime/skip-times';
import type { RequestHandler } from './$types';

const segment = {
    anilistId: z.int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    kind: z.enum(['opening', 'ending']),
};
const segmentRequestSchema = z.discriminatedUnion('operation', [
    z.object({
        ...segment,
        operation: z.literal('clear'),
    }),
    z.object({
        ...segment,
        operation: z.literal('apply-template'),
        start: z.number().nonnegative(),
    }),
    z.object({
        ...segment,
        operation: z.literal('set'),
        interval: SkipIntervalInputSchema.refine(
            (interval) => validSkipInterval(interval) !== null
        ),
        createTemplate: z.boolean(),
    }),
]);

export const PUT: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    let body;
    try {
        body = segmentRequestSchema.parse(await request.json());
    } catch {
        return json({ message: 'Invalid segments' }, { status: 400 });
    }

    try {
        const saved = await saveEpisodeSegment(body);
        if (!saved) {
            return json({ message: 'Episode not found' }, { status: 404 });
        }

        return json(saved, {
            headers: {
                'cache-control': 'no-store',
            },
        });
    } catch (cause) {
        console.error('Skip time save failed', cause);
        return json({ message: 'Segments could not be saved' }, { status: 500 });
    }
};
