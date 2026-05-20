-- +goose Up
CREATE INDEX IF NOT EXISTS idx_watch_list_entry_user_updated_at
ON watch_list_entry(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_list_entry_user_status_updated_at_desc
ON watch_list_entry(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_list_entry_status_updated_at_anime_id
ON watch_list_entry(status, updated_at DESC, anime_id);

CREATE INDEX IF NOT EXISTS idx_continue_watching_anime_id
ON continue_watching_entry(anime_id);

CREATE INDEX IF NOT EXISTS idx_jikan_cache_expires_at_datetime
ON jikan_cache(datetime(expires_at));

-- +goose Down
DROP INDEX IF EXISTS idx_jikan_cache_expires_at_datetime;
DROP INDEX IF EXISTS idx_continue_watching_anime_id;
DROP INDEX IF EXISTS idx_watch_list_entry_status_updated_at_anime_id;
DROP INDEX IF EXISTS idx_watch_list_entry_user_status_updated_at_desc;
DROP INDEX IF EXISTS idx_watch_list_entry_user_updated_at;
