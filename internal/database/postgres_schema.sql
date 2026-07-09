-- Provider responses, retry queues, relation snapshots, and episode availability
-- are Redis caches now. They are intentionally discarded during the one-time
-- PostgreSQL migration and rebuilt on demand.
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

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip TEXT,
    user_agent TEXT,
    metadata_json TEXT
);

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
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_occurred_at ON audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_occurred_at ON audit_log(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_occurred_at ON recommendation_event(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_event_type_occurred_at ON recommendation_event(user_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_event_anime_occurred_at ON recommendation_event(anime_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_impression_user_occurred_at ON recommendation_impression(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_impression_request_id ON recommendation_impression(request_id);
CREATE INDEX IF NOT EXISTS idx_generated_subtitle_status ON generated_subtitle(status, updated_at);
