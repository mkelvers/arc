import { json } from '@sveltejs/kit';

import type { SkipInterval } from '$lib/player/skip-times';
import { validSkipInterval } from '$lib/server/anime/aniskip';
import { saveEpisodeSkipTimes } from '$lib/server/anime/skip-times';
import { isRecord } from '$lib/utils';
import type { RequestHandler } from './$types';

function optionalInterval(value: unknown): SkipInterval | null | undefined {
  if (value === null) {
    return null;
  }

  return validSkipInterval(value) ?? undefined;
}

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
  const opening = optionalInterval(body.opening);
  const ending = optionalInterval(body.ending);

  if (
    typeof anilistId !== 'number' ||
    !Number.isSafeInteger(anilistId) ||
    anilistId <= 0 ||
    !episodeId ||
    episodeId.length > 512 ||
    opening === undefined ||
    ending === undefined
  ) {
    return json({ message: 'Invalid segments' }, { status: 400 });
  }

  try {
    const saved = await saveEpisodeSkipTimes(anilistId, episodeId, {
      opening,
      ending,
    });
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
