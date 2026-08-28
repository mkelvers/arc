import { z } from 'zod';

import { AnimeSearchResultSchema } from '@arc/shared/search';
import { AnimeCardPageSchema, AnimeCardSchema, EpisodeRevisionSchema } from '@arc/shared/types';
import { SegmentSaveResultSchema } from '@arc/shared/player/skip-times';

export const AnimeIdSchema = z.coerce.number().int().positive();

export const SearchQuerySchema = z.object({
    q: z.string().trim().max(200).default(''),
});

export const PageQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
});

export const EpisodeSchema = z.looseObject({
    id: z.string(),
    number: z.number(),
    label: z.string(),
    title: z.string(),
    href: z.string(),
    audio: z.array(z.enum(['sub', 'dub', 'raw'])),
    image: z.string().nullable(),
    duration: z.string(),
    releaseDate: z.string(),
    overview: z.string(),
});

const AnimeDetailsSchema = z.object({
    id: z.number().int().positive(),
    title: z.string(),
    bannerImage: z.string().nullable(),
    description: z.string(),
    genres: z.array(z.string()),
    format: z.string(),
    status: z.string().nullable(),
    nextAiringEpisode: z.object({ episode: z.number(), airingAt: z.number().int() }).nullable(),
    score: z.number(),
    members: z.string(),
    favourites: z.string(),
    themes: z.array(z.string()),
    studios: z.array(z.string()),
    staff: z.string(),
    rankings: z.array(z.string()),
});

const ArtworkImageSchema = z.object({
    aspectRatio: z.number(),
    filePath: z.string(),
    height: z.number().int(),
    language: z.string().nullable(),
    url: z.string(),
    voteAverage: z.number(),
    width: z.number().int(),
});

const ArtworkSchema = z.object({
    id: z.number().int(),
    mediaType: z.enum(['movie', 'tv']),
    backdrops: z.array(ArtworkImageSchema),
    logos: z.array(ArtworkImageSchema),
    selectedBackdrop: ArtworkImageSchema.nullable(),
    selectedLogo: ArtworkImageSchema.nullable(),
    selectedPoster: ArtworkImageSchema.nullable(),
    logoHidden: z.boolean(),
    logoSize: z.number(),
});

const HomeHeroSchema = z.object({
    id: z.number().int().positive(),
    href: z.string(),
    link: z.string(),
    episodeLabel: z.string(),
    title: z.string(),
    image: z.string(),
    logo: z.object({ url: z.string(), size: z.number() }),
    audioLabel: z.string(),
    genres: z.array(z.string()),
    description: z.string(),
});

const MediaFormatSchema = z.enum([
    'MANGA',
    'MOVIE',
    'MUSIC',
    'NOVEL',
    'ONA',
    'ONE_SHOT',
    'OVA',
    'SPECIAL',
    'TV',
    'TV_SHORT',
]);

const MediaStatusSchema = z.enum([
    'CANCELLED',
    'FINISHED',
    'HIATUS',
    'NOT_YET_RELEASED',
    'RELEASING',
]);

const MediaRelationSchema = z.enum([
    'ADAPTATION',
    'ALTERNATIVE',
    'CHARACTER',
    'COMPILATION',
    'CONTAINS',
    'OTHER',
    'PARENT',
    'PREQUEL',
    'SAME_UNIVERSE',
    'SEQUEL',
    'SIDE_STORY',
    'SOURCE',
    'SPIN_OFF',
    'SUMMARY',
]);

const ContinueWatchingSchema = z.object({
    animeId: z.number().int().positive(),
    title: z.string(),
    link: z.string(),
    backdrop: z.string(),
    episodeImage: z.string(),
    episodeLabel: z.string(),
    audioLabel: z.string(),
    duration: z.string(),
    resumeAtSeconds: z.number().nonnegative(),
});

export const HomePageSchema = z.object({
    highlights: z.array(HomeHeroSchema),
    season: z.array(AnimeCardSchema),
    popular: z.array(AnimeCardSchema),
    continueWatching: z.array(ContinueWatchingSchema),
});

export const SearchResponseSchema = z.array(AnimeSearchResultSchema);

export const CatalogPageSchema = AnimeCardPageSchema.extend({
    loadedAt: z.iso.datetime(),
});

export const AnimePageSchema = z.object({
    anime: AnimeDetailsSchema,
    artwork: ArtworkSchema.nullable(),
    episodes: z.array(EpisodeSchema),
    episodeRevision: z.string().nullable(),
    watchAction: z.object({
        href: z.string(),
        kind: z.enum(['continue', 'start', 'episodes']),
        episode: z.string().nullable(),
    }),
    audioLabel: z.string(),
    franchise: z
        .object({
            types: z.array(z.object({ id: z.string(), label: z.string() })),
            entries: z.array(
                AnimeCardSchema.extend({
                    malId: z.number().int().positive(),
                    anilistId: z.number().int().positive(),
                    type: z.string(),
                    format: MediaFormatSchema.nullable(),
                    status: MediaStatusSchema.nullable(),
                    episodes: z.number().int().nullable(),
                    duration: z.number().nullable(),
                    popularity: z.number().nullable(),
                    relations: z.array(
                        z.object({ type: MediaRelationSchema, malId: z.number().int().positive() })
                    ),
                    secondary: z.boolean(),
                    primary: z.boolean(),
                })
            ),
        })
        .nullable(),
    watchlistState: z.enum(['watching', 'plan_to_watch', 'completed', 'dropped']).nullable(),
});

export const WatchPageSchema = z.object({
    canonicalHref: z.string().nullable(),
    anime: AnimeDetailsSchema,
    poster: z.string().nullable(),
    logo: z.object({ url: z.string(), size: z.number() }).nullable(),
    episodes: z.array(EpisodeSchema),
    currentEpisode: EpisodeSchema,
    previousEpisode: EpisodeSchema.nullable(),
    nextEpisode: EpisodeSchema.nullable(),
    fallbackImage: z.string().nullable(),
    startAt: z.number().nonnegative(),
    progressEventAt: z.number().int().nonnegative(),
});

export const WatchSegmentsSchema = z.object({
    times: z.object({
        opening: z.object({ start: z.number(), end: z.number() }).nullable(),
        ending: z.object({ start: z.number(), end: z.number() }).nullable(),
        source: z.enum(['aniskip', 'manual']).nullable(),
    }),
    templates: z.object({
        opening: z
            .object({ fromEpisode: z.number().int().positive(), duration: z.number() })
            .nullable(),
        ending: z
            .object({ fromEpisode: z.number().int().positive(), duration: z.number() })
            .nullable(),
    }),
});

const PlaybackStreamSchema = z.strictObject({
    provider: z.string(),
    server: z.string(),
    url: z.string(),
    quality: z.string().nullable(),
    subtitles: z.array(
        z.strictObject({
            kind: z.enum(['full', 'sdh', 'forced']),
            url: z.string(),
        })
    ),
});

export const WatchPlaybackSchema = z.object({
    error: z.boolean(),
    streams: z.strictObject({
        sub: z.array(PlaybackStreamSchema),
        dub: z.array(PlaybackStreamSchema),
        raw: z.array(PlaybackStreamSchema),
    }),
});

export const MediaPageSchema = z.object({
    anime: z.union([
        AnimeDetailsSchema,
        z.object({ id: z.number().int().positive(), title: z.string() }),
    ]),
    artwork: ArtworkSchema.nullable(),
});

export const PlaybackProgressSchema = z.object({
    animeId: z.number().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    episodeNumber: z.number().min(-1_000_000).max(1_000_000),
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z
        .number()
        .positive()
        .max(7 * 24 * 60 * 60),
    completed: z.boolean(),
    eventAt: z.number().int().nonnegative(),
});

const SegmentFields = {
    anilistId: z.number().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    kind: z.enum(['opening', 'ending']),
};

export const SegmentRequestSchema = z.discriminatedUnion('operation', [
    z.object({ ...SegmentFields, operation: z.literal('clear') }),
    z.object({
        ...SegmentFields,
        operation: z.literal('apply-template'),
        start: z.number().nonnegative(),
    }),
    z.object({
        ...SegmentFields,
        operation: z.literal('set'),
        interval: z.object({
            start: z.number().nonnegative(),
            end: z.number().positive(),
        }),
        createTemplate: z.boolean(),
    }),
]);

export { EpisodeRevisionSchema, SegmentSaveResultSchema };
