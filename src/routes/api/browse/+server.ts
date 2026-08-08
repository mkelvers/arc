import { error, json } from '@sveltejs/kit';

import { parseBrowseFilters } from '$lib/anime/browse';
import { browsePage, BrowseFilterError } from '$lib/server/anime/browse';
import { positiveInteger } from '$lib/utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const filters = parseBrowseFilters(url.searchParams);
  const page = positiveInteger(url.searchParams.get('page'));
  if (!filters || !page) {
    error(400, 'Valid browse filters and a page are required');
  }

  try {
    const result = await browsePage(filters, page);
    return json({
      anime: result.anime,
      hasNextPage: result.hasNextPage,
      page: result.page,
    });
  } catch (cause) {
    if (cause instanceof BrowseFilterError) {
      error(400, cause.message);
    }

    console.error(`Browse page ${page} load failed`, cause);
    error(502, 'More anime could not be loaded');
  }
};
