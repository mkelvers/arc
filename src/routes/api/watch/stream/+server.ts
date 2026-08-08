import { error, type RequestHandler } from '@sveltejs/kit';

import { proxyStreamRequest, StreamProxyError } from '$lib/server/anime/stream-proxy';

export const GET: RequestHandler = async ({ request, fetch }) => {
  try {
    return await proxyStreamRequest(request, fetch);
  } catch (cause) {
    if (cause instanceof StreamProxyError) {
      error(cause.status, cause.message);
    }
    throw cause;
  }
};
