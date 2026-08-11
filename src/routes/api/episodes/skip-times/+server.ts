import { json } from '@sveltejs/kit';

import { validSkipInterval } from '$lib/server/anime/aniskip';
import { saveEpisodeSegment } from '$lib/server/anime/skip-times';
import { isRecord } from '$lib/utils';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        return json({ message: 'Authentication required' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ message: 'Invalid JSON body' }, { status: 400 });
    }

    if (!isRecord(body)) {
        return json({ message: 'Invalid segments' }, { status: 400 });
    }

    const anilistId = body.anilistId;
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId.trim() : '';
    const kind = body.kind === 'opening' || body.kind === 'ending' ? body.kind : null;
    const operation = body.operation;

    if (
        typeof anilistId !== 'number' ||
        !Number.isSafeInteger(anilistId) ||
        anilistId <= 0 ||
        !episodeId ||
        episodeId.length > 512 ||
        !kind
    ) {
        return json({ message: 'Invalid segments' }, { status: 400 });
    }

    const interval = operation === 'set' ? validSkipInterval(body.interval) : null;
    const save =
        operation === 'clear'
            ? ({ kind, operation } as const)
            : operation === 'apply-template' &&
                typeof body.start === 'number' &&
                Number.isFinite(body.start) &&
                body.start >= 0
              ? ({ kind, operation, start: body.start } as const)
              : operation === 'set' && interval && typeof body.createTemplate === 'boolean'
                ? ({ kind, operation, interval, createTemplate: body.createTemplate } as const)
                : null;
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
