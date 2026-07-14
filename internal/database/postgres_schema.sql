-- Provider responses, retry queues, relation snapshots, and episode availability
-- are Redis caches now and are rebuilt on demand.
DROP TABLE IF EXISTS episode_provider_mapping;
DROP TABLE IF EXISTS episode_availability_cache;
DROP TABLE IF EXISTS anime_relation;
DROP TABLE IF EXISTS anime_fetch_retry;
DROP TABLE IF EXISTS jikan_cache;

CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    avatar_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anime (
    id BIGINT PRIMARY KEY,
    title_original TEXT NOT NULL,
    title_english TEXT,
    title_japanese TEXT,
    image_url TEXT NOT NULL,
    banner_image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    airing BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT '',
    relations_synced_at TIMESTAMPTZ,
    duration_seconds DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS watch_list_entry (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    anime_id BIGINT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('watching', 'completed', 'dropped', 'plan_to_watch', 'on_hold')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_episode BIGINT DEFAULT 0,
    last_episode_at TIMESTAMPTZ,
    current_time_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    completed_at_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS notification_preference (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS continue_watching_entry (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    anime_id BIGINT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    current_episode BIGINT,
    current_time_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_seconds DOUBLE PRECISION,
    UNIQUE(user_id, anime_id)
);

CREATE TABLE IF NOT EXISTS api_token (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS skip_segment_override (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    anime_id BIGINT NOT NULL,
    episode BIGINT NOT NULL,
    skip_type TEXT NOT NULL CHECK(skip_type IN ('op', 'ed')),
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, anime_id, episode, skip_type)
);

CREATE TABLE IF NOT EXISTS data_fixes (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anime_external_mapping (
    anilist_id BIGINT PRIMARY KEY,
    mal_id BIGINT,
    tmdb_media_type TEXT NOT NULL CHECK(tmdb_media_type IN ('tv', 'movie')),
    tmdb_id BIGINT NOT NULL,
    tmdb_season INTEGER NOT NULL DEFAULT -1,
    source TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anime_mapping_override (
    anilist_id BIGINT PRIMARY KEY,
    mal_id BIGINT,
    tmdb_media_type TEXT CHECK(tmdb_media_type IN ('tv', 'movie')),
    tmdb_id BIGINT,
    tmdb_season INTEGER NOT NULL DEFAULT -1,
    canonical BOOLEAN NOT NULL DEFAULT FALSE,
    excluded BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(excluded OR (tmdb_media_type IS NOT NULL AND tmdb_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS anime_mapping_import (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
    source TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    etag TEXT NOT NULL DEFAULT '',
    entry_count BIGINT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anime_inferred_mapping (
    anilist_id BIGINT PRIMARY KEY,
    mal_id BIGINT,
    tmdb_media_type TEXT NOT NULL CHECK(tmdb_media_type IN ('tv', 'movie')),
    tmdb_id BIGINT NOT NULL,
    tmdb_season INTEGER NOT NULL DEFAULT -1,
    relation_type TEXT NOT NULL,
    related_anilist_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE VIEW anime_effective_mapping AS
SELECT
    base.anilist_id,
    base.mal_id,
    base.tmdb_media_type,
    base.tmdb_id,
    base.tmdb_season,
    FALSE AS canonical
FROM anime_external_mapping AS base
WHERE NOT EXISTS (
    SELECT 1
    FROM anime_mapping_override AS override
    WHERE override.anilist_id = base.anilist_id
)
UNION ALL
SELECT
    inferred.anilist_id,
    inferred.mal_id,
    inferred.tmdb_media_type,
    inferred.tmdb_id,
    inferred.tmdb_season,
    FALSE AS canonical
FROM anime_inferred_mapping AS inferred
WHERE NOT EXISTS (
    SELECT 1
    FROM anime_mapping_override AS override
    WHERE override.anilist_id = inferred.anilist_id
)
AND NOT EXISTS (
    SELECT 1
    FROM anime_external_mapping AS base
    WHERE base.anilist_id = inferred.anilist_id
)
UNION ALL
SELECT
    override.anilist_id,
    override.mal_id,
    override.tmdb_media_type,
    override.tmdb_id,
    override.tmdb_season,
    override.canonical
FROM anime_mapping_override AS override
WHERE NOT override.excluded;

CREATE TABLE IF NOT EXISTS recommendation_event (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    anime_id BIGINT REFERENCES anime(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    source TEXT,
    metadata_json TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_impression (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    anime_id BIGINT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    rail TEXT NOT NULL,
    position BIGINT NOT NULL,
    request_id TEXT,
    metadata_json TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_profile_snapshot (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    profile_json TEXT NOT NULL,
    source_window_start TIMESTAMPTZ,
    source_window_end TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_subtitle (
    anime_id BIGINT NOT NULL,
    episode BIGINT NOT NULL,
    mode TEXT NOT NULL CHECK(mode = 'dub'),
    model TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'ready', 'failed')),
    vtt TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (anime_id, episode, mode)
);

CREATE INDEX IF NOT EXISTS idx_continue_watching_user_updated ON continue_watching_entry(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_continue_watching_anime_id ON continue_watching_entry(anime_id);
CREATE INDEX IF NOT EXISTS idx_api_token_user_id ON api_token(user_id);
CREATE INDEX IF NOT EXISTS idx_skip_segment_override_lookup ON skip_segment_override(user_id, anime_id, episode);
CREATE INDEX IF NOT EXISTS idx_watch_list_entry_user_updated_at ON watch_list_entry(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_list_entry_user_status_updated_at_desc ON watch_list_entry(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_list_entry_status_updated_at_anime_id ON watch_list_entry(status, updated_at DESC, anime_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_occurred_at ON recommendation_event(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_event_type_occurred_at ON recommendation_event(user_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_anime_occurred_at ON recommendation_event(anime_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_impression_user_occurred_at ON recommendation_impression(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_impression_request_id ON recommendation_impression(request_id);
CREATE INDEX IF NOT EXISTS idx_generated_subtitle_status ON generated_subtitle(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_anime_external_mapping_mal_id ON anime_external_mapping(mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_external_mapping_tmdb ON anime_external_mapping(tmdb_media_type, tmdb_id);
CREATE INDEX IF NOT EXISTS idx_anime_mapping_override_tmdb ON anime_mapping_override(tmdb_media_type, tmdb_id) WHERE NOT excluded;
CREATE INDEX IF NOT EXISTS idx_anime_inferred_mapping_mal_id ON anime_inferred_mapping(mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_inferred_mapping_tmdb ON anime_inferred_mapping(tmdb_media_type, tmdb_id);
