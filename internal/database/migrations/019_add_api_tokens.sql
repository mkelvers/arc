-- +goose Up
CREATE TABLE IF NOT EXISTS api_token (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    revoked_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_api_token_user_id ON api_token(user_id);

-- +goose Down
DROP TABLE IF EXISTS api_token;
