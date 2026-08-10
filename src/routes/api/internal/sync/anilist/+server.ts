import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { getAutomaticSyncUsers, syncUser } from '$lib/server/sync/service';
import type { RequestHandler } from './$types';

const userIdSchema = z.object({ userId: z.string().uuid() });

function authorize(request: Request) {
  if (!env.ARC_WORKER_TOKEN) {
    throw new Error('ARC_WORKER_TOKEN is not configured');
  }

  return request.headers.get('authorization') === `Bearer ${env.ARC_WORKER_TOKEN}`;
}

export const GET: RequestHandler = async ({ request }) => {
  if (!authorize(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  return json(await getAutomaticSyncUsers());
};

export const POST: RequestHandler = async ({ request }) => {
  if (!authorize(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = userIdSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json({ message: 'Invalid sync user' }, { status: 400 });
  }

  await syncUser(parsed.data.userId);
  return new Response(null, { status: 204 });
};
