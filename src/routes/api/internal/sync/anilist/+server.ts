import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { getAutomaticSyncUsers, syncUser } from '$lib/server/sync/service';
import { GraphQLRequestError } from '$lib/server/graphql';
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

  try {
    await syncUser(parsed.data.userId);
  } catch (cause) {
    if (
      cause instanceof GraphQLRequestError &&
      (cause.status === 429 || cause.status == null || cause.status >= 500)
    ) {
      const response = new Response(null, { status: cause.status === 429 ? 429 : 503 });
      if (cause.retryAfterMs !== undefined) {
        response.headers.set('Retry-After', String(Math.ceil(cause.retryAfterMs / 1_000)));
      }
      return response;
    }

    throw cause;
  }

  return new Response(null, { status: 204 });
};
