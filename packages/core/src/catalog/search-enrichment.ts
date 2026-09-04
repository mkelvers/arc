import { inArray } from 'drizzle-orm';

import { audioAvailabilityLabel, type AudioMode } from '../audio';
import { inferSearchArtwork, type AnimeSearchResult, type SearchArtwork } from '../search';
import { db } from '@arc/shared/db';
import { animeEpisode } from '@arc/shared/db/schema';
import { getStoredBackdropCandidates, imageUrl } from './tmdb';

async function storedArtwork(anilistIds: number[]) {
    const rows = await getStoredBackdropCandidates(anilistIds);

    const candidates = new Map<number, SearchArtwork[]>();
    for (const row of rows) {
        candidates.set(row.anilistId, [
            ...(candidates.get(row.anilistId) ?? []),
            {
                group: `tmdb:${row.mediaType}:${row.targetId}`,
                backdrop: row.filePath ? imageUrl(row.filePath, 'w780') : null,
            },
        ]);
    }

    return new Map(
        [...candidates].flatMap(([anilistId, values]) => {
            const groups = new Set(values.map(({ group }) => group));
            return groups.size === 1 ? [[anilistId, values[0]] as const] : [];
        })
    );
}

async function storedPlayback(anilistIds: number[]) {
    const rows = await db
        .select({
            anilistId: animeEpisode.anilistId,
            number: animeEpisode.number,
            audio: animeEpisode.audio,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, anilistIds));

    const playback = new Map<number, { audio: Set<AudioMode>; number: number }>();
    for (const row of rows) {
        const stored = playback.get(row.anilistId);
        if (!stored) {
            playback.set(row.anilistId, {
                audio: new Set(row.audio),
                number: row.number,
            });
            continue;
        }

        row.audio.forEach((mode) => stored.audio.add(mode));
        if (row.number > 0 && (stored.number <= 0 || row.number < stored.number)) {
            stored.number = row.number;
        }
    }

    return playback;
}

export async function withAnimeSearchMetadata<T extends AnimeSearchResult>(results: T[]) {
    const anilistIds = [...new Set(results.map(({ id }) => id))];
    if (!anilistIds.length) {
        return results;
    }

    const artworkIds = [
        ...new Set([...anilistIds, ...results.flatMap(({ relatedIds }) => relatedIds)]),
    ];
    const [stored, playback] = await Promise.all([
        storedArtwork(artworkIds),
        storedPlayback(anilistIds),
    ]);
    const artwork = inferSearchArtwork(results, stored);

    return results.map((result) => {
        const stored = playback.get(result.id);
        const selectedArtwork = artwork.get(result.id);
        return {
            ...result,
            backdrop: selectedArtwork?.backdrop ?? null,
            artworkGroup: selectedArtwork?.group ?? null,
            audioLabel: stored ? audioAvailabilityLabel([...stored.audio]) : '',
            link: stored
                ? `/anime/${result.id}/watch/${encodeURIComponent(String(stored.number))}`
                : result.link,
        };
    });
}
