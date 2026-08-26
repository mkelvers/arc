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

export const externalProvider = pgEnum('external_provider', ['anilist', 'tmdb']);

export const externalMediaType = pgEnum('external_media_type', ['anime', 'movie', 'tv']);

export const artworkType = pgEnum('artwork_type', ['backdrop', 'logo']);
export const episodeAudio = pgEnum('episode_audio', ['sub', 'dub', 'raw']);
export const episodeTextSource = pgEnum('episode_text_source', ['tmdb', 'machine']);
export const episodeSegmentKind = pgEnum('episode_segment_kind', ['opening', 'ending']);

export const schedulerInterestSource = pgEnum('scheduler_interest_source', [
    'watchlist',
    'continue_watching',
]);
export const animeEpisodeTargetState = pgEnum('anime_episode_target_state', [
    'pending',
    'confirmed',
    'failed',
    'retired',
]);
export const maintenanceTaskKind = pgEnum('maintenance_task_kind', [
    'release_refresh',
    'mapping_rediscover',
    'mapping_override',
    'target_reactivate',
    'interest_reconcile',
    'airing_reconcile',
    'episode_backfill',
]);
export const maintenanceTaskState = pgEnum('maintenance_task_state', [
    'pending',
    'running',
    'completed',
    'failed',
]);
export const mappingOverrideKind = pgEnum('mapping_override_kind', ['playback', 'metadata']);
export const mappingValidationStatus = pgEnum('mapping_validation_status', [
    'pending',
    'valid',
    'invalid',
]);

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

export const animeRelease = pgTable(
    'anime_release',
    {
        anilistId: integer('anilist_id').primaryKey(),
        data: jsonb('data').$type<unknown>(),
        title: text('title').notNull(),
        imageUrl: text('image_url'),
        status: varchar('status', { length: 32 }),
        format: varchar('format', { length: 16 }),
        malId: integer('mal_id'),
        episodeCount: integer('episode_count'),
        durationMinutes: integer('duration_minutes'),
        nextAiringAt: timestamp('next_airing_at', { withTimezone: true }),
        nextAiringEpisode: integer('next_airing_episode'),
        schemaRevision: integer('schema_revision').notNull().default(1),
        sourceFetchedAt: timestamp('source_fetched_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('anime_release_status_airing_idx').on(table.status, table.nextAiringAt),
        index('anime_release_mal_idx').on(table.malId),
    ]
);

export const animeReleaseRequest = pgTable(
    'anime_release_request',
    {
        anilistId: integer('anilist_id').primaryKey(),
        attempts: integer('attempts').notNull().default(0),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
        leaseOwner: text('lease_owner'),
        leaseUntil: timestamp('lease_until', { withTimezone: true }),
        lastError: text('last_error'),
        requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [index('anime_release_request_due_idx').on(table.nextAttemptAt, table.leaseUntil)]
);

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
        mappingRevision: text('mapping_revision'),
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

export const animeArtworkSource = pgTable('anime_artwork_source', {
    anilistId: integer('anilist_id').primaryKey(),
    sourceAnilistId: integer('source_anilist_id').notNull(),
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
    data: jsonb('data').$type<unknown>().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const homeHeroCandidate = pgTable(
    'home_hero_candidate',
    {
        anilistId: integer('anilist_id').primaryKey(),
        averageScore: integer('average_score').notNull(),
        trendingRank: integer('trending_rank').notNull(),
        fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index('home_hero_candidate_fetched_idx').on(table.fetchedAt)]
);

export const homeHeroSelection = pgTable(
    'home_hero_selection',
    {
        rotationStart: varchar('rotation_start', { length: 10 }).notNull(),
        position: integer('position').notNull(),
        anilistId: integer('anilist_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.rotationStart, table.position] }),
        unique('home_hero_selection_rotation_anilist_unique').on(
            table.rotationStart,
            table.anilistId
        ),
    ]
);

export const animeSynopsisCache = pgTable('anime_synopsis_cache', {
    anilistId: integer('anilist_id').primaryKey(),
    synopsis: text('synopsis'),
    sourceAnilistId: integer('source_anilist_id'),
    tmdbExternalIdId: integer('tmdb_external_id_id').references(() => animeExternalId.id, {
        onDelete: 'set null',
    }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animeDetailsCache = pgTable('anime_details_cache', {
    anilistId: integer('anilist_id').primaryKey(),
    data: jsonb('data').$type<unknown>().notNull(),
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

export const animeSearchIndex = pgTable(
    'anime_search_index',
    {
        anilistId: integer('anilist_id').primaryKey(),
        searchText: text('search_text').notNull(),
        data: jsonb('data').$type<unknown>().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('anime_search_index_text_idx').using(
            'gin',
            table.searchText.asc().op('gin_trgm_ops')
        ),
    ]
);

export const animeCardCache = pgTable('anime_card_cache', {
    anilistId: integer('anilist_id').primaryKey(),
    data: jsonb('data').$type<unknown>().notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const animeSimulcastPageCache = pgTable(
    'anime_simulcast_page_cache',
    {
        season: varchar('season', { length: 8 }).notNull(),
        year: integer('year').notNull(),
        page: integer('page').notNull(),
        data: jsonb('data').$type<unknown>().notNull(),
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
        duration: integer('duration'),
        discoveryRevision: integer('discovery_revision').notNull().default(0),
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
    metadataRevision: text('metadata_revision'),
    stableSince: timestamp('stable_since', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    nextRefreshAt: timestamp('next_refresh_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    lastError: text('last_error'),
});

export const animeRecentVisit = pgTable(
    'anime_recent_visit',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        anilistId: integer('anilist_id').notNull(),
        visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.anilistId] }),
        index('anime_recent_visit_time_idx').on(table.visitedAt),
    ]
);

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
        eventAt: timestamp('event_at', { withTimezone: true }).notNull().defaultNow(),
        dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    },
    (table) => [
        unique('playback_progress_user_anime_unique').on(table.userId, table.animeId),
        index('playback_progress_user_watched_idx').on(table.userId, table.lastWatchedAt),
    ]
);

export const animeInterestDirty = pgTable(
    'anime_interest_dirty',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        animeId: integer('anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        dirtyAt: timestamp('dirty_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.animeId] }),
        index('anime_interest_dirty_time_idx').on(table.dirtyAt),
    ]
);

export const animeReleaseInterest = pgTable(
    'anime_release_interest',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        source: schedulerInterestSource('source').notNull(),
        sourceAnimeId: integer('source_anime_id')
            .notNull()
            .references(() => anime.id, { onDelete: 'cascade' }),
        trackedAnilistId: integer('tracked_anilist_id')
            .notNull()
            .references(() => animeRelease.anilistId, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.userId, table.source, table.sourceAnimeId, table.trackedAnilistId],
        }),
        index('anime_release_interest_tracked_idx').on(table.trackedAnilistId),
        index('anime_release_interest_source_idx').on(table.userId, table.sourceAnimeId),
    ]
);

export const animeEpisodeTarget = pgTable(
    'anime_episode_target',
    {
        anilistId: integer('anilist_id')
            .notNull()
            .references(() => animeRelease.anilistId, { onDelete: 'cascade' }),
        targetEpisode: integer('target_episode').notNull(),
        expectedEpisodes: integer('expected_episodes'),
        airingAt: timestamp('airing_at', { withTimezone: true }).notNull(),
        firstScheduledAt: timestamp('first_scheduled_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
        attemptCount: integer('attempt_count').notNull().default(0),
        failureCount: integer('failure_count').notNull().default(0),
        lastError: text('last_error'),
        leaseOwner: text('lease_owner'),
        leaseUntil: timestamp('lease_until', { withTimezone: true }),
        state: animeEpisodeTargetState('state').notNull().default('pending'),
        inventoryRevision: text('inventory_revision'),
        confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
        retiredAt: timestamp('retired_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        primaryKey({ columns: [table.anilistId, table.targetEpisode] }),
        index('anime_episode_target_due_idx').on(
            table.state,
            table.nextAttemptAt,
            table.leaseUntil
        ),
    ]
);

export const maintenanceTask = pgTable(
    'maintenance_task',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        kind: maintenanceTaskKind('kind').notNull(),
        dedupeKey: text('dedupe_key').unique(),
        payload: jsonb('payload').$type<unknown>().notNull(),
        state: maintenanceTaskState('state').notNull().default('pending'),
        attempts: integer('attempts').notNull().default(0),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
        leaseOwner: text('lease_owner'),
        leaseUntil: timestamp('lease_until', { withTimezone: true }),
        lastError: text('last_error'),
        result: jsonb('result').$type<unknown>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
        completedAt: timestamp('completed_at', { withTimezone: true }),
    },
    (table) => [
        index('maintenance_task_due_idx').on(table.state, table.nextAttemptAt, table.leaseUntil),
    ]
);

export const schedulerHeartbeat = pgTable('scheduler_heartbeat', {
    name: text('name').primaryKey(),
    activeRunId: uuid('active_run_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastFullReconciliationAt: timestamp('last_full_reconciliation_at', { withTimezone: true }),
    lastError: text('last_error'),
    stats: jsonb('stats').$type<unknown>(),
});

export const animeMappingOverride = pgTable(
    'anime_mapping_override',
    {
        anilistId: integer('anilist_id')
            .notNull()
            .references(() => animeRelease.anilistId, { onDelete: 'cascade' }),
        kind: mappingOverrideKind('kind').notNull(),
        provider: varchar('provider', { length: 32 }).notNull(),
        externalId: text('external_id').notNull(),
        mediaType: varchar('media_type', { length: 16 }),
        previousMapping: jsonb('previous_mapping').$type<unknown>(),
        validationStatus: mappingValidationStatus('validation_status').notNull().default('pending'),
        validationEvidence: jsonb('validation_evidence').$type<unknown>(),
        maintenanceActor: text('maintenance_actor').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        clearedAt: timestamp('cleared_at', { withTimezone: true }),
    },
    (table) => [primaryKey({ columns: [table.anilistId, table.kind, table.provider] })]
);

export type Anime = typeof anime.$inferSelect;
export type AnimeExternalId = typeof animeExternalId.$inferSelect;
export type AnimeArtwork = typeof animeArtwork.$inferSelect;
export type WatchlistState = (typeof watchlistState.enumValues)[number];
