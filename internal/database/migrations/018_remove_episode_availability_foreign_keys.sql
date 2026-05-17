-- +goose Up
PRAGMA foreign_keys=OFF;

ALTER TABLE episode_availability_cache RENAME TO episode_availability_cache_old;

CREATE TABLE IF NOT EXISTS episode_availability_cache (
    anime_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    next_refresh_at DATETIME,
    retry_until_at DATETIME,
    last_attempt_at DATETIME,
    last_success_at DATETIME,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO episode_availability_cache (
    anime_id,
    data,
    next_refresh_at,
    retry_until_at,
    last_attempt_at,
    last_success_at,
    failure_count,
    last_error,
    updated_at
)
SELECT
    anime_id,
    data,
    next_refresh_at,
    retry_until_at,
    last_attempt_at,
    last_success_at,
    failure_count,
    last_error,
    updated_at
FROM episode_availability_cache_old;

DROP TABLE episode_availability_cache_old;

ALTER TABLE episode_provider_mapping RENAME TO episode_provider_mapping_old;

CREATE TABLE IF NOT EXISTS episode_provider_mapping (
    anime_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_show_id TEXT NOT NULL,
    failed_until DATETIME,
    last_error TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (anime_id, provider)
);

INSERT OR REPLACE INTO episode_provider_mapping (
    anime_id,
    provider,
    provider_show_id,
    failed_until,
    last_error,
    updated_at
)
SELECT
    anime_id,
    provider,
    provider_show_id,
    failed_until,
    last_error,
    updated_at
FROM episode_provider_mapping_old;

DROP TABLE episode_provider_mapping_old;

CREATE INDEX IF NOT EXISTS idx_episode_availability_next_refresh
ON episode_availability_cache(next_refresh_at);

PRAGMA foreign_keys=ON;

-- +goose Down
