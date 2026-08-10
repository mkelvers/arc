import { json } from '@sveltejs/kit';

import { parsePlaybackProgress } from '$lib/server/playback-progress/input';
import { savePlaybackProgress } from '$lib/server/playback-progress/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ message: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const progress = parsePlaybackProgress(body);
  if (!progress) {
    return json({ message: 'Invalid playback progress' }, { status: 400 });
  }

  try {
    await savePlaybackProgress(locals.user.id, progress);
  } catch (cause) {
    console.error('Playback progress save failed', cause);

    return json({ message: 'Playback progress save failed' }, { status: 500 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
    },
  });
};
