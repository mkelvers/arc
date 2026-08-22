import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { SkipIntervalInputSchema, validSkipInterval } from '@arc/backend/internal/anime/aniskip';
import { saveEpisodeSegment } from '@arc/backend/internal/anime/skip-times';
import type { RequestHandler } from './$types';

const segmentRequestSchema = z.object({
    anilistId: z.number().finite().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    kind: z.enum(['opening', 'ending']),
    operation: z.enum(['clear', 'apply-template', 'set']),
    start: z.number().finite().nonnegative().optional(),
    interval: SkipIntervalInputSchema.optional(),
    createTemplate: z.boolean().optional(),
});

export const PUT: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    let body: z.infer<typeof segmentRequestSchema>;
    try {
        const parsed = segmentRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            return json({ message: 'Invalid segments' }, { status: 400 });
        }
        body = parsed.data;
    } catch {
        return json({ message: 'Invalid JSON body' }, { status: 400 });
    }

    const anilistId = body.anilistId;
    const episodeId = body.episodeId;
    const kind = body.kind;
    const operation = body.operation;

    let save: Parameters<typeof saveEpisodeSegment>[2] | null = null;
    if (operation === 'clear') {
        save = { kind, operation };
    } else if (operation === 'apply-template' && body.start !== undefined) {
        save = { kind, operation, start: body.start };
    } else if (
        operation === 'set' &&
        body.createTemplate !== undefined &&
        body.interval !== undefined
    ) {
        const interval = validSkipInterval(body.interval);
        if (interval) {
            save = { kind, operation, interval, createTemplate: body.createTemplate };
        }
    }

    if (!save) {
        return json({ message: 'Invalid segments' }, { status: 400 });
    }

    try {
        const saved = await saveEpisodeSegment(anilistId, episodeId, save);
        if (!saved) {
            return json({ message: 'Episode not found' }, { status: 404 });
        }

        return json(saved, {
            headers: { 'cache-control': 'no-store' },
        });
    } catch (cause) {
        console.error('Skip time save failed', cause);
        return json({ message: 'Segments could not be saved' }, { status: 500 });
    }
};
