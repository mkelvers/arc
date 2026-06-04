-- +goose Up
CREATE TABLE IF NOT EXISTS recommendation_event (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    anime_id INTEGER,
    event_type TEXT NOT NULL,
    source TEXT,
    metadata_json TEXT,
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY(anime_id) REFERENCES anime(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_occurred_at
ON recommendation_event(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_event_user_event_type_occurred_at
ON recommendation_event(user_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_event_anime_occurred_at
ON recommendation_event(anime_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_impression (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    anime_id INTEGER NOT NULL,
    rail TEXT NOT NULL,
    position INTEGER NOT NULL,
    request_id TEXT,
    metadata_json TEXT,
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY(anime_id) REFERENCES anime(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_impression_user_occurred_at
ON recommendation_impression(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_impression_request_id
ON recommendation_impression(request_id);

CREATE TABLE IF NOT EXISTS recommendation_profile_snapshot (
    user_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    source_window_start DATETIME,
    source_window_end DATETIME,
    computed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE IF EXISTS recommendation_profile_snapshot;
DROP INDEX IF EXISTS idx_recommendation_impression_request_id;
DROP INDEX IF EXISTS idx_recommendation_impression_user_occurred_at;
DROP TABLE IF EXISTS recommendation_impression;
DROP INDEX IF EXISTS idx_recommendation_event_anime_occurred_at;
DROP INDEX IF EXISTS idx_recommendation_event_user_event_type_occurred_at;
DROP INDEX IF EXISTS idx_recommendation_event_user_occurred_at;
DROP TABLE IF EXISTS recommendation_event;
