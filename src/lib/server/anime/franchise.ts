import { inArray } from 'drizzle-orm';
import { Effect } from 'effect';

import {
    episodeAudioAvailabilityLabel,
    type AudioMode,
} from '$lib/anime/audio';
import type { FranchiseOrder } from '$lib/anime/types';
import { FranchiseMediaDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { graphql } from '$lib/server/graphql';
import { plainText } from './anilist/text';
import {
    fetchOrder,
    type ChiakiEntry,
} from './franchise/chiaki';

const anilistEndpoint = 'https://graphql.anilist.co';
const cacheLifetime = 24 * 60 * 60 * 1_000;

const cache = new Map<number, { data: FranchiseOrder; fetchedAt: number }>();
const requests = new Map<number, Promise<FranchiseOrder>>();

async function fetchMetadata(entries: ChiakiEntry[]) {
    const result = await Effect.runPromise(
        graphql(anilistEndpoint, FranchiseMediaDocument, {
            malIds: entries.map(({ malId }) => malId),
        }),
    );

    return new Map(
        (result.Page?.media ?? [])
            .filter((media) => media?.idMal)
            .map((media) => [media!.idMal!, media!] as const),
    );
}

function synopsis(value: string | null | undefined) {
    return plainText(value)
        .replace(/\s*\(Source:[\s\S]*$/i, '')
        .replace(/\s*Note:[\s\S]*$/i, '')
        .trim();
}

async function cachedPlayback(anilistIds: number[]) {
    if (!anilistIds.length) {
        return new Map<
            number,
            {
                audioLabel: string;
                watchHref: string | null;
            }
        >();
    }

    const cached = await db
        .select({
            anilistId: animeEpisode.anilistId,
            episodeId: animeEpisode.episodeId,
            number: animeEpisode.number,
            audio: animeEpisode.audio,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, anilistIds));
    const grouped = new Map<
        number,
        Array<{ episodeId: string; number: number; audio: AudioMode[] }>
    >();

    for (const episode of cached) {
        grouped.set(episode.anilistId, [
            ...(grouped.get(episode.anilistId) ?? []),
            episode,
        ]);
    }

    return new Map(
        [...grouped].map(([anilistId, episodes]) => {
            const first = episodes.toSorted(
                (left, right) => left.number - right.number,
            )[0];

            return [
                anilistId,
                {
                    audioLabel: episodeAudioAvailabilityLabel(episodes),
                    watchHref: first
                        ? `/anime/${anilistId}/watch/${encodeURIComponent(first.episodeId)}`
                        : null,
                },
            ] as const;
        }),
    );
}

async function refresh(malId: number) {
    const { types, entries } = await fetchOrder(malId);
    const typeLabels = new Map(types.map(({ id, label }) => [id, label]));
    const metadata = await fetchMetadata(entries);
    const playback = await cachedPlayback(
        [...metadata.values()].map(({ id }) => id),
    );
    const data: FranchiseOrder = {
        types,
        entries: entries.flatMap((entry) => {
            const media = metadata.get(entry.malId);
            const anilistId = media?.id;
            const type = typeLabels.get(entry.typeId);

            if (!anilistId || !type) {
                return [];
            }

            return [
                {
                    malId: entry.malId,
                    anilistId,
                    id: anilistId,
                    type,
                    title:
                        media?.title?.english ||
                        entry.alternativeTitle ||
                        media?.title?.romaji ||
                        media?.title?.native ||
                        entry.title,
                    image:
                        media?.coverImage?.extraLarge ??
                        media?.coverImage?.large ??
                        entry.image,
                    caption:
                        playback.get(anilistId)?.audioLabel ?? '',
                    score: media?.averageScore ?? 0,
                    genres: (media?.genres ?? []).flatMap((genre) =>
                        genre ? [genre] : [],
                    ),
                    synopsis: synopsis(media?.description),
                    secondary: entry.secondary,
                    href: `/anime/${anilistId}`,
                    watchHref:
                        playback.get(anilistId)?.watchHref ??
                        `/anime/${anilistId}`,
                },
            ];
        }),
    };

    cache.set(malId, { data, fetchedAt: Date.now() });

    return data;
}

async function getFranchiseOrder(malId: number): Promise<FranchiseOrder> {
    const cached = cache.get(malId);
    if (cached && Date.now() - cached.fetchedAt < cacheLifetime) {
        return cached.data;
    }

    const pending = requests.get(malId);
    if (pending) {
        return pending;
    }

    const request = refresh(malId).catch((cause) => {
        if (cached) {
            return cached.data;
        }
        throw cause;
    });
    requests.set(malId, request);

    try {
        return await request;
    } finally {
        requests.delete(malId);
    }
}

export const franchise = {
    getFranchiseOrder,
};
