import {
    boolean,
    doublePrecision,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type { FranchiseCacheData } from '$lib/server/anime/franchise/cache';
import type { AnimeCard } from '$lib/anime/types';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

type AniListAnime = NonNullable<AnimeQuery['Media']>;

export const externalProvider = pgEnum('external_provider', ['anilist', 'tmdb']);

export const externalMediaType = pgEnum('external_media_type', ['anime', 'movie', 'tv']);

export const artworkType = pgEnum('artwork_type', ['backdrop', 'logo']);
export const episodeAudio = pgEnum('episode_audio', ['sub', 'dub', 'raw']);
export const episodeTextSource = pgEnum('episode_text_source', ['tmdb', 'machine']);
export const episodeSegmentKind = pgEnum('episode_segment_kind', ['opening', 'ending']);

export const watchlistState = pgEnum('watchlist_state', [
    'watching',
    'plan_to_watch',
    'completed',
    'dropped',
]);

export const users = pgTable(
    'users',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        email: text('email').notNull(),
        emailVerified: boolean('email_verified').notNull().default(false),
        image: text('image'),
        username: text('username').notNull(),
        displayUsername: text('display_username').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        unique('users_email_unique').on(table.email),
        unique('users_username_unique').on(table.username),
    ]
);

export const accounts = pgTable(
    'accounts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: timestamp('access_token_expires_at', {
            withTimezone: true,
        }),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
            withTimezone: true,
        }),
        scope: text('scope'),
        password: text('password'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        unique('accounts_provider_account_unique').on(table.providerId, table.accountId),
        index('accounts_user_id_idx').on(table.userId),
    ]
);

export const sessions = pgTable(
    'sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        token: text('token').notNull().unique('sessions_token_unique'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const syncSettings = pgTable('sync_settings', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),
    automaticSync: boolean('automatic_sync').notNull().default(false),
    episodeProgress: boolean('episode_progress').notNull().default(false),
    watchingStatus: boolean('watching_status').notNull().default(false),
    importAnilistChanges: boolean('import_anilist_changes').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const verifications = pgTable(
    'verifications',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [index('verifications_identifier_idx').on(table.identifier)]
);

export const invitations = pgTable(
    'invitations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        codeHash: text('code_hash').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        reservedAt: timestamp('reserved_at', { withTimezone: true }),
        reservationId: uuid('reservation_id'),
        usedAt: timestamp('used_at', { withTimezone: true }),
        usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    },
    (table) => [
        unique('invitations_code_hash_unique').on(table.codeHash),
        uniqueIndex('invitations_reservation_id_unique').on(table.reservationId),
        index('invitations_used_by_user_id_idx').on(table.usedByUserId),
    ]
);

export const anime = pgTable('anime', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const animeExternalId = pgTable(
    'anime_external_id',
    {
        id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
        provider: externalProvider('provider').notNull(),
        mediaType: externalMediaType('media_type').notNull(),
        externalId: integer('external_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('anime_external_id_identity').on(table.provider, table.mediaType, table.externalId),
    ]
);

export const animeExternalIdLink = pgTable(
    'anime_external_id_link',
    {
        animeId: integer('anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        externalIdId: integer('external_id_id')
            .notNull()
            .references(() => animeExternalId.id, { onDelete: 'cascade' }),
        verifiedAt: timestamp('verified_at', { withTimezone: true }),
    },
    (table) => [primaryKey({ columns: [table.animeId, table.externalIdId] })]
);

export const animeArtwork = pgTable(
    'anime_artwork',
    {
        externalIdId: integer('external_id_id')
            .notNull()
            .references(() => animeExternalId.id, { onDelete: 'cascade' }),
        type: artworkType('type').notNull(),
        filePath: text('file_path').notNull(),
        aspectRatio: doublePrecision('aspect_ratio').notNull(),
        height: integer('height').notNull(),
        language: varchar('language', { length: 16 }),
        voteAverage: doublePrecision('vote_average').notNull(),
        width: integer('width').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.externalIdId, table.type, table.filePath],
        }),
    ]
);

export const animeArtworkCache = pgTable('anime_artwork_cache', {
    externalIdId: integer('external_id_id')
        .primaryKey()
        .references(() => animeExternalId.id, { onDelete: 'cascade' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    allLanguages: boolean('all_languages').notNull().default(false),
});

export const animeArtworkPreference = pgTable('anime_artwork_preference', {
    externalIdId: integer('external_id_id')
        .primaryKey()
        .references(() => animeExternalId.id, { onDelete: 'cascade' }),
    backdropFilePath: text('backdrop_file_path'),
    logoFilePath: text('logo_file_path'),
    logoHidden: boolean('logo_hidden').notNull().default(false),
    logoSize: integer('logo_size').notNull().default(100),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const animeReleasePoster = pgTable(
    'anime_release_poster',
    {
        animeId: integer('anime_id').primaryKey(),
        externalIdId: integer('external_id_id').notNull(),
        filePath: text('file_path'),
        seasonNumber: integer('season_number'),
        aspectRatio: doublePrecision('aspect_ratio'),
        height: integer('height'),
        language: varchar('language', { length: 16 }),
        voteAverage: doublePrecision('vote_average'),
        width: integer('width'),
        fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.animeId, table.externalIdId],
            foreignColumns: [animeExternalIdLink.animeId, animeExternalIdLink.externalIdId],
        }).onDelete('cascade'),
        index('anime_release_poster_external_id_idx').on(table.externalIdId),
        uniqueIndex('anime_release_poster_external_file_unique').on(
            table.externalIdId,
            table.filePath
        ),
    ]
);

export const animeFranchiseCache = pgTable('anime_franchise_cache', {
    malId: integer('mal_id').primaryKey(),
    data: jsonb('data').$type<FranchiseCacheData>().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const homeHeroSelection = pgTable(
    'home_hero_selection',
    {
        weekStart: varchar('week_start', { length: 10 }).notNull(),
        position: integer('position').notNull(),
        anilistId: integer('anilist_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.weekStart, table.position] }),
        unique('home_hero_selection_week_anilist_unique').on(table.weekStart, table.anilistId),
    ]
);

export const animeDetailsCache = pgTable('anime_details_cache', {
    anilistId: integer('anilist_id').primaryKey(),
    data: jsonb('data').$type<AniListAnime>().notNull(),
    version: integer('version').notNull().default(1),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const anilistQueryCache = pgTable(
    'anilist_query_cache',
    {
        key: varchar('key', { length: 64 }).primaryKey(),
        data: jsonb('data').$type<unknown>().notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index('anilist_query_cache_expires_idx').on(table.expiresAt)]
);

export const animeCardCache = pgTable('anime_card_cache', {
    anilistId: integer('anilist_id').primaryKey(),
    data: jsonb('data').$type<AnimeCard>().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animeSimulcastPageCache = pgTable(
    'anime_simulcast_page_cache',
    {
        season: varchar('season', { length: 8 }).notNull(),
        year: integer('year').notNull(),
        page: integer('page').notNull(),
        data: jsonb('data')
            .$type<{ anime: AnimeCard[]; hasNextPage: boolean; page: number }>()
            .notNull(),
        fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.season, table.year, table.page] })]
);

export const animeCatalog = pgTable(
    'anime_catalog',
    {
        anilistId: integer('anilist_id').primaryKey(),
        title: text('title').notNull(),
        searchText: text('search_text').notNull(),
        imageUrl: text('image_url').notNull(),
        synopsis: text('synopsis').notNull(),
        genres: text('genres').array().notNull(),
        tags: text('tags').array().notNull().default([]),
        format: varchar('format', { length: 16 }),
        status: varchar('status', { length: 32 }),
        source: varchar('source', { length: 32 }),
        season: varchar('season', { length: 16 }),
        seasonYear: integer('season_year'),
        countryOfOrigin: varchar('country_of_origin', { length: 8 }),
        isAdult: boolean('is_adult').notNull(),
        popularity: integer('popularity'),
        averageScore: integer('average_score'),
        sourceFetchedAt: timestamp('source_fetched_at', {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('anime_catalog_safe_popularity_idx').on(table.isAdult, table.popularity),
        index('anime_catalog_safe_score_idx').on(table.isAdult, table.averageScore),
        index('anime_catalog_format_status_idx').on(table.format, table.status),
        index('anime_catalog_season_year_idx').on(table.season, table.seasonYear),
        index('anime_catalog_source_country_idx').on(table.source, table.countryOfOrigin),
        index('anime_catalog_genres_idx').using('gin', table.genres),
        index('anime_catalog_tags_idx').using('gin', table.tags),
    ]
);

export const animeCatalogRefresh = pgTable('anime_catalog_refresh', {
    queryKey: text('query_key').primaryKey(),
    animeIds: integer('anime_ids').array().notNull().default([]),
    hasNextPage: boolean('has_next_page').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animeCatalogTaxonomy = pgTable('anime_catalog_taxonomy', {
    provider: varchar('provider', { length: 32 }).primaryKey(),
    genres: text('genres').array().notNull(),
    tags: text('tags').array().notNull().default([]),
    formats: text('formats').array().notNull(),
    statuses: text('statuses').array().notNull(),
    sources: text('sources').array().notNull().default([]),
    seasons: text('seasons').array().notNull().default([]),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animePlaybackProvider = pgTable('anime_playback_provider', {
    anilistId: integer('anilist_id').primaryKey(),
    allanimeShowId: text('allanime_show_id').notNull(),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animeProviderMapping = pgTable(
    'anime_provider_mapping',
    {
        anilistId: integer('anilist_id').notNull(),
        provider: varchar('provider', { length: 32 }).notNull(),
        providerMediaId: text('provider_media_id').notNull(),
        discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
        verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.anilistId, table.provider] })]
);

export const animeEpisode = pgTable(
    'anime_episode',
    {
        anilistId: integer('anilist_id').notNull(),
        episodeId: text('episode_id').notNull(),
        number: doublePrecision('number').notNull(),
        providerTitle: text('provider_title'),
        metadataTitle: text('metadata_title'),
        metadataTitleSource: episodeTextSource('metadata_title_source'),
        audio: episodeAudio('audio').array().notNull(),
        imageUrl: text('image_url'),
        runtimeMinutes: integer('runtime_minutes'),
        airDate: text('air_date'),
        overview: text('overview'),
        overviewSource: episodeTextSource('overview_source'),
        openingStartSeconds: doublePrecision('opening_start_seconds'),
        openingEndSeconds: doublePrecision('opening_end_seconds'),
        endingStartSeconds: doublePrecision('ending_start_seconds'),
        endingEndSeconds: doublePrecision('ending_end_seconds'),
        skipTimesSource: varchar('skip_times_source', { length: 16 }),
        skipTimesFetchedAt: timestamp('skip_times_fetched_at', {
            withTimezone: true,
        }),
        firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
        lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
        lastVerifiedAt: timestamp('last_verified_at', {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.anilistId, table.episodeId] }),
        index('anime_episode_anilist_number_idx').on(table.anilistId, table.number),
    ]
);

export const animeEpisodeSegmentTemplate = pgTable(
    'anime_episode_segment_template',
    {
        anilistId: integer('anilist_id').notNull(),
        kind: episodeSegmentKind('kind').notNull(),
        episodeFrom: integer('episode_from').notNull(),
        durationSeconds: doublePrecision('duration_seconds').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.anilistId, table.kind, table.episodeFrom] }),
        index('anime_episode_segment_template_lookup_idx').on(
            table.anilistId,
            table.kind,
            table.episodeFrom
        ),
    ]
);

export const animeEpisodeSync = pgTable('anime_episode_sync', {
    anilistId: integer('anilist_id').primaryKey(),
    mediaStatus: varchar('media_status', { length: 32 }),
    expectedEpisodes: integer('expected_episodes'),
    nextAiringAt: timestamp('next_airing_at', { withTimezone: true }),
    nextAiringEpisode: integer('next_airing_episode'),
    sourceRevision: text('source_revision'),
    metadataExternalIdId: integer('metadata_external_id_id').references(() => animeExternalId.id, {
        onDelete: 'set null',
    }),
    stableSince: timestamp('stable_since', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    nextRefreshAt: timestamp('next_refresh_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    lastError: text('last_error'),
});

export const watchlist = pgTable(
    'watchlist',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        animeId: integer('anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        state: watchlistState('state').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        unique('watchlist_user_anime_unique').on(table.userId, table.animeId),
        index('watchlist_user_updated_idx').on(table.userId, table.updatedAt),
    ]
);

export const playbackProgress = pgTable(
    'playback_progress',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        animeId: integer('anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        episodeId: text('episode_id').notNull(),
        episodeNumber: doublePrecision('episode_number').notNull(),
        positionSeconds: doublePrecision('position_seconds').notNull(),
        durationSeconds: doublePrecision('duration_seconds').notNull(),
        completed: boolean('completed').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
        lastWatchedAt: timestamp('last_watched_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('playback_progress_user_anime_unique').on(table.userId, table.animeId),
        index('playback_progress_user_watched_idx').on(table.userId, table.lastWatchedAt),
    ]
);

export type Anime = typeof anime.$inferSelect;
export type AnimeExternalId = typeof animeExternalId.$inferSelect;
export type AnimeArtwork = typeof animeArtwork.$inferSelect;
export type WatchlistState = (typeof watchlistState.enumValues)[number];
