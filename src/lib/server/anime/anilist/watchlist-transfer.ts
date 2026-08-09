import { WatchlistTransferAnimeDocument } from '$lib/graphql/anilist/generated/graphql';
import type { WatchlistImportEntry } from '$lib/server/watchlist-transfer';
import { batches } from '$lib/utils';
import { request } from './client';
import { present } from './text';

const pageSize = 50;

export interface WatchlistTransferAnime {
  id: number;
  idMal: number | null;
  title: {
    english: string | null;
    romaji: string | null;
    native: string | null;
  } | null;
}

export async function getWatchlistTransferAnime(anilistIds: number[], malIds: number[] = []) {
  const anilistBatches = batches([...new Set(anilistIds)], pageSize);
  const malBatches = batches([...new Set(malIds)], pageSize);
  const requestCount = Math.max(anilistBatches.length, malBatches.length);
  const media: WatchlistTransferAnime[] = [];

  for (let index = 0; index < requestCount; index += 1) {
    const response = await request(WatchlistTransferAnimeDocument, {
      anilistIds: anilistBatches[index] ?? [],
      malIds: malBatches[index] ?? [],
    });

    media.push(...present(response.anilist?.media), ...present(response.mal?.media));
  }

  return [...new Map(media.map((entry) => [entry.id, entry])).values()];
}

export async function resolveWatchlistImport(entries: WatchlistImportEntry[]) {
  const media = await getWatchlistTransferAnime(
    entries.flatMap(({ anilistId }) => (anilistId ? [anilistId] : [])),
    entries.flatMap(({ malId }) => (malId ? [malId] : []))
  );
  const byAniListId = new Map(media.map((entry) => [entry.id, entry]));
  const byMalId = new Map(
    media.flatMap((entry) => (entry.idMal ? ([[entry.idMal, entry]] as const) : []))
  );

  return new Map(
    entries.flatMap((entry) => {
      const match =
        (entry.anilistId ? byAniListId.get(entry.anilistId) : undefined) ??
        (entry.malId ? byMalId.get(entry.malId) : undefined);

      return match ? ([[entry.index, match]] as const) : [];
    })
  );
}
