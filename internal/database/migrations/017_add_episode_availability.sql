-- +goose Up
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

CREATE TABLE IF NOT EXISTS episode_provider_mapping (
    anime_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_show_id TEXT NOT NULL,
    failed_until DATETIME,
    last_error TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (anime_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_episode_availability_next_refresh
ON episode_availability_cache(next_refresh_at);

-- +goose Down
