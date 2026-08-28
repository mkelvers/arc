import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeSeasonSelection } from '@arc/shared/season';
import type { AnimeCard } from '@arc/shared/types';
import { and, eq } from 'drizzle-orm';
import {
    AllAnimeAvailableEpisodesDocument,
    AllAnimeSearchDocument,
    AllAnimeSimulcastPageDocument,
    AllAnimeWeeklyPopularDocument,
    type AllAnimeAvailableEpisodesQuery,
    type AllAnimeSearchQuery,
    type VaildTranslationTypeEnumType,
} from './generated/graphql';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from '../providers/mapping';
import { db } from '@arc/db';
import { animeSimulcastPageCache } from '@arc/db/schema';
import { positiveInteger, text } from '#utils';
import type { JsonValue } from '#utils';
import { animeTitles, plainText } from '../anilist/text';
import { request } from './client';
import type { AniListAnime } from '../anilist/types';
import type { ProviderEpisode } from '../providers/types';
import { AnimeCardPageSchema } from '@arc/shared/types';
import { z } from 'zod';

const providerName = 'allanime';

interface WeeklyPopularAnime {
    anilistId: number;
    audio: AudioMode[];
}

const audioDetailSchema = z.object({
    sub: z.array(z.unknown()).optional(),
    dub: z.array(z.unknown()).optional(),
    raw: z.array(z.unknown()).optional(),
});
const seasonSchema = z.object({
    quarter: z.string().optional(),
    year: z.union([z.number(), z.string()]).optional(),
});

function audioModes(value: JsonValue) {
    const parsed = audioDetailSchema.safeParse(value);
    if (!parsed.success) {
        return [];
    }

    return (['sub', 'dub', 'raw'] as const).filter((mode) => {
        return Boolean(parsed.data[mode]?.length);
    });
}

function matchesSeason(value: JsonValue, selected: AnimeSeasonSelection) {
    const parsed = seasonSchema.safeParse(value);
    if (!parsed.success) {
        return false;
    }
    const quarter = text(parsed.data.quarter)?.toUpperCase();
    const year = positiveInteger(parsed.data.year);

    return quarter === selected.season && year === selected.year;
}

function simulcastCard(show: {
    aniListId: number | string | null;
    availableEpisodesDetail: unknown;
    averageScore: number | null;
    description: string | null;
    englishName: string | null;
    genres: string[] | null;
    name: string | null;
    thumbnail: string | null;
}): AnimeCard | null {
    const id = positiveInteger(show.aniListId);
    const image = text(show.thumbnail);
    const title = text(show.englishName) ?? text(show.name);
    if (!id || !image || !title) {
        return null;
    }

    return {
        id,
        href: `/anime/${id}`,
        link: `/anime/${id}`,
        title,
        image,
        audioLabel: audioAvailabilityLabel(
            audioModes(
                z.json().safeParse(show.availableEpisodesDetail).success
                    ? z.json().parse(show.availableEpisodesDetail)
                    : null
            )
        ),
        score: Math.round(show.averageScore ?? 0),
        genres: [...new Set((show.genres ?? []).map((genre) => genre.trim()).filter(Boolean))],
        synopsis: plainText(show.description),
    };
}

async function requestSimulcastPage(selected: AnimeSeasonSelection, page: number) {
    const variables = {
        search: {
            allowAdult: false,
            allowUnknown: false,
            season: `${selected.season[0]}${selected.season.slice(1).toLowerCase()}`,
            year: selected.year,
        },
        page,
        limit: 24,
    };
    const response = await request(AllAnimeSimulcastPageDocument, variables);
    const shows = response.shows?.edges ?? [];
    const seen = new Set<number>();
    const anime: AnimeCard[] = [];

    for (const show of shows) {
        const season = z.json().safeParse(show.season);
        if (!matchesSeason(season.success ? season.data : null, selected)) {
            continue;
        }

        const card = simulcastCard(show);
        if (!card || seen.has(card.id)) {
            continue;
        }

        seen.add(card.id);
        anime.push(card);
    }

    return {
        anime,
        hasNextPage: shows.length === variables.limit,
        page,
    };
}

export function refreshSimulcastPage(selected: AnimeSeasonSelection, page: number) {
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new RangeError('Simulcast page must be a positive integer');
    }

    return requestSimulcastPage(selected, page).then(async (data) => {
        try {
            await db
                .insert(animeSimulcastPageCache)
                .values({
                    season: selected.season,
                    year: selected.year,
                    page,
                    data,
                    fetchedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [
                        animeSimulcastPageCache.season,
                        animeSimulcastPageCache.year,
                        animeSimulcastPageCache.page,
                    ],
                    set: { data, fetchedAt: new Date() },
                });
        } catch (cause) {
            console.warn('AllAnime simulcast cache write failed', cause);
        }

        return data;
    });
}

export function getSimulcastPage(selected: AnimeSeasonSelection, page: number) {
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new RangeError('Simulcast page must be a positive integer');
    }

    const key = `${selected.season}:${selected.year}:${page}`;
    return db
        .select({
            data: animeSimulcastPageCache.data,
        })
        .from(animeSimulcastPageCache)
        .where(
            and(
                eq(animeSimulcastPageCache.season, selected.season),
                eq(animeSimulcastPageCache.year, selected.year),
                eq(animeSimulcastPageCache.page, page)
            )
        )
        .limit(1)
        .then(([stored]) => {
            const parsed = stored ? AnimeCardPageSchema.safeParse(stored.data) : null;
            if (!parsed?.success) {
                throw new Error(`No stored AllAnime simulcast page for ${key}`);
            }
            return parsed.data;
        });
}

async function getWeeklyPopularAnime() {
    return request(AllAnimeWeeklyPopularDocument, {}).then((data) => {
        const recommendations = (data.queryPopular?.recommendations ?? [])
            .map((recommendation, index) => ({
                card: recommendation.anyCard,
                index,
            }))
            .toSorted(
                (left, right) =>
                    (left.card?.siteRanks?.weekly?.position ?? left.index + 1) -
                    (right.card?.siteRanks?.weekly?.position ?? right.index + 1)
            );
        const seen = new Set<number>();
        const anime: WeeklyPopularAnime[] = [];

        for (const { card } of recommendations) {
            const anilistId = Number(card?.aniListId);
            if (!Number.isSafeInteger(anilistId) || anilistId <= 0 || seen.has(anilistId)) {
                continue;
            }

            seen.add(anilistId);
            anime.push({
                anilistId,
                audio: audioModes(
                    z.json().safeParse(card?.availableEpisodesDetail ?? null).success
                        ? z.json().parse(card?.availableEpisodesDetail ?? null)
                        : null
                ),
            });
        }

        return anime;
    });
}

export async function getPopularAudioLabels() {
    const anime = await getWeeklyPopularAnime();

    return new Map(
        anime.flatMap(({ anilistId, audio }) => (audio.length ? [[anilistId, audio] as const] : []))
    );
}

export async function findShowId(anime: AniListAnime, refresh = false) {
    if (!anime.idMal) {
        throw new Error(`AniList ${anime.id} has no MAL ID`);
    }

    if (!refresh) {
        const stored = await providerMediaId(anime.id, providerName);
        if (stored) {
            return stored;
        }
    }

    const titles = animeTitles(anime);

    // Provider title search is only discovery. MAL identity remains the match
    // contract so similarly named seasons and movies cannot leak in.
    for (const mode of ['sub', 'dub', 'raw'] as const) {
        for (const query of titles) {
            const data = await request<
                AllAnimeSearchQuery,
                {
                    search: {
                        allowAdult: boolean;
                        allowUnknown: boolean;
                        query: string;
                    };
                    translationType: VaildTranslationTypeEnumType;
                }
            >(AllAnimeSearchDocument, {
                search: {
                    allowAdult: false,
                    allowUnknown: false,
                    query,
                },
                translationType: mode,
            });
            const match = data.shows?.edges?.find(
                (show) => Number(show.malId) === anime.idMal && show._id
            );

            if (!match?._id) {
                continue;
            }

            await saveProviderMediaId(anime.id, providerName, match._id);

            return match._id;
        }
    }

    throw new Error(`AllAnime has no exact MAL match for ${anime.idMal}`);
}

export async function getEpisodes(anime: AniListAnime): Promise<ProviderEpisode[]> {
    let showId = await findShowId(anime);
    const load = (id: string) =>
        request<AllAnimeAvailableEpisodesQuery, { showId: string; start: number; end: number }>(
            AllAnimeAvailableEpisodesDocument,
            {
                showId: id,
                start: 0,
                end: 100_000,
            }
        );
    let data = await load(showId);

    if (!data.show) {
        showId = await findShowId(anime, true);
        data = await load(showId);
    }

    if (!data.show) {
        throw new Error(`AllAnime show ${showId} was not found`);
    }

    await verifyProviderMediaId(anime.id, providerName);

    const detail = audioDetailSchema.safeParse(data.show.availableEpisodesDetail).success
        ? audioDetailSchema.parse(data.show.availableEpisodesDetail)
        : {};
    const strings = (key: AudioMode) => {
        const values = detail[key];

        return (
            values?.flatMap((value) => {
                const parsed = z.string().safeParse(value);
                return parsed.success ? [parsed.data] : [];
            }) ?? []
        );
    };
    const sub = new Set(strings('sub'));
    const dub = new Set(strings('dub'));
    const raw = new Set(strings('raw'));
    const episodeInfo = new Map(
        (data.episodeInfos ?? []).flatMap((episode) => {
            const id = String(episode.episodeIdNum ?? '').trim();
            const [rawTitle] = (episode.notes ?? '').split(/<note-split>/i);
            const title = rawTitle
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replaceAll('&amp;', '&')
                .replaceAll('&quot;', '"')
                .replaceAll('&#39;', "'")
                .replaceAll('&lt;', '<')
                .replaceAll('&gt;', '>')
                .replace(/\s+/g, ' ')
                .trim();

            return id ? [[id, { title }] as const] : [];
        })
    );

    return [...new Set([...sub, ...dub, ...raw])]
        .flatMap((id) => {
            const number = Number(id);

            if (!Number.isFinite(number) || number < 0) {
                return [];
            }

            return [
                {
                    id,
                    number,
                    title: episodeInfo.get(id)?.title ?? '',
                    audio: [
                        ...(sub.has(id) ? ['sub' as const] : []),
                        ...(dub.has(id) ? ['dub' as const] : []),
                        ...(raw.has(id) ? ['raw' as const] : []),
                    ],
                },
            ];
        })
        .sort((left, right) => left.number - right.number);
}
