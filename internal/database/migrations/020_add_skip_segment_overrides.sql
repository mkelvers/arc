-- +goose Up
CREATE TABLE IF NOT EXISTS skip_segment_override (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  anime_id INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  skip_type TEXT NOT NULL, -- 'op' or 'ed'
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, anime_id, episode, skip_type)
);

CREATE INDEX IF NOT EXISTS idx_skip_segment_override_lookup
  ON skip_segment_override(user_id, anime_id, episode);

-- +goose Down
DROP TABLE IF EXISTS skip_segment_override;

