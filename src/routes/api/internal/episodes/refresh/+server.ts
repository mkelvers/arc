import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';

import { refreshDue } from '$lib/server/anime/episodes';

function authorized(header: string | null) {
  const token = env.EPISODE_SYNC_TOKEN;
  if (!token || !header) {
    return false;
  }

  const supplied = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const POST: RequestHandler = async ({ request, url }) => {
  if (!env.EPISODE_SYNC_TOKEN) {
    error(503, 'Episode sync is not configured');
  }
  if (!authorized(request.headers.get('authorization'))) {
    error(401, 'Unauthorized');
  }

  const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100))
    : 20;
  const results = await refreshDue(limit);

  return json(
    {
      attempted: results.length,
      failed: results.filter(({ ok }) => !ok).length,
      results,
    },
    {
      headers: { 'cache-control': 'no-store' },
    }
  );
};
