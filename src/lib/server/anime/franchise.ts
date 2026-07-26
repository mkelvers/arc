import * as cheerio from 'cheerio';
import { inArray } from 'drizzle-orm';
import { Effect } from 'effect';

import {
    formatEpisodesAudioLabel,
    type AnimeCardData,
    type AudioMode,
} from '$lib/anime';
import { FranchiseMediaDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { graphql } from '$lib/server/graphql';

const anilistEndpoint = 'https://graphql.anilist.co';
const chiakiBaseUrl = 'https://chiaki.site';
const cacheLifetime = 24 * 60 * 60 * 1_000;
const maxHtmlLength = 2 * 1024 * 1024;

export interface FranchiseOrder {
    types: Array<{
        id: string;
        label: string;
    }>;
    entries: Array<AnimeCardData & {
        malId: number;
        anilistId: number;
        type: string;
        secondary: boolean;
        watchlisted?: boolean;
    }>;
}

interface ChiakiEntry {
    malId: number;
    anilistId: number | null;
    typeId: string;
    title: string;
    alternativeTitle: string;
    imageUrl: string;
    secondary: boolean;
}

const cache = new Map<number, { data: FranchiseOrder; fetchedAt: number }>();
const requests = new Map<number, Promise<FranchiseOrder>>();

function positiveInteger(value: string | undefined) {
    const parsed = Number(value);

    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function imageUrl(style: string | undefined) {
    const path = style?.match(/url\((['"]?)(.*?)\1\)/i)?.[2]?.trim();

    return path ? new URL(path, `${chiakiBaseUrl}/`).href : '';
}

async function fetchChiaki(malId: number) {
    const url = `${chiakiBaseUrl}/?/tools/watch_order/id/${malId}`;
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: `${chiakiBaseUrl}/`,
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new Error(`Chiaki returned ${response.status}`);
    }

    const html = await response.text();
    if (html.length > maxHtmlLength) {
        throw new Error('Chiaki response was unexpectedly large');
    }

    const $ = cheerio.load(html);
    const types = $('#wo_type_filter label')
        .map((_, label) => {
            const input = $(label).find("input[type='checkbox']").first();
            const id = input.attr('value')?.trim();
            const text = $(label).text().replace(/\s+/g, ' ').trim();

            return id && text ? { id, label: text } : null;
        })
        .get()
        .filter((type): type is FranchiseOrder['types'][number] =>
            Boolean(type),
        );
    const entries = $('#wo_list tr[data-id]')
        .map((_, row) => {
            const element = $(row);
            const entry: ChiakiEntry = {
                malId: positiveInteger(element.attr('data-id')) ?? 0,
                anilistId: positiveInteger(element.attr('data-anilist-id')),
                typeId: element.attr('data-type')?.trim() ?? '',
                title: element.find('.wo_title').first().text().trim(),
                alternativeTitle: element
                    .find('.uk-text-small')
                    .first()
                    .text()
                    .trim(),
                imageUrl: imageUrl(
                    element.find('.wo_avatar_big').first().attr('style'),
                ),
                secondary: element.hasClass('wo_row_secondary'),
            };

            return entry.malId && entry.typeId && entry.title && entry.imageUrl
                ? entry
                : null;
        })
        .get()
        .filter((entry): entry is ChiakiEntry => Boolean(entry));

    if (!types.length || !entries.length) {
        throw new Error('Chiaki watch-order markup was not found');
    }

    return { types, entries };
}

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
    return (value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\(Source:[\s\S]*$/i, '')
        .replace(/\s*Note:[\s\S]*$/i, '')
        .trim();
}

async function cachedPlayback(anilistIds: number[]) {
    if (!anilistIds.length) return new Map<number, {
        audioLabel: string;
        playHref: string | null;
    }>();

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
                    audioLabel: formatEpisodesAudioLabel(episodes),
                    playHref: first
                        ? `/anime/${anilistId}/watch/${encodeURIComponent(first.episodeId)}`
                        : null,
                },
            ] as const;
        }),
    );
}

async function refresh(malId: number) {
    const { types, entries } = await fetchChiaki(malId);
    const typeLabels = new Map(types.map(({ id, label }) => [id, label]));
    const metadata = await fetchMetadata(entries);
    const playback = await cachedPlayback(
        [...metadata.values()].map(({ id }) => id),
    );
    const data: FranchiseOrder = {
        types,
        entries: entries.flatMap((entry) => {
            const media = metadata.get(entry.malId);
            const anilistId = media?.id ?? entry.anilistId;
            const type = typeLabels.get(entry.typeId);

            if (!anilistId || !type) return [];

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
                    imageUrl:
                        media?.coverImage?.extraLarge ??
                        media?.coverImage?.large ??
                        entry.imageUrl,
                    secondaryLabel:
                        playback.get(anilistId)?.audioLabel ?? '',
                    score: media?.averageScore ?? 0,
                    genres: (media?.genres ?? []).flatMap((genre) =>
                        genre ? [genre] : [],
                    ),
                    synopsis: synopsis(media?.description),
                    secondary: entry.secondary,
                    href: `/anime/${anilistId}`,
                    playHref:
                        playback.get(anilistId)?.playHref ??
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
    if (pending) return pending;

    const request = refresh(malId).catch((cause) => {
        if (cached) return cached.data;
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
