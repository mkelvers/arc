-- +goose Up
CREATE TABLE IF NOT EXISTS data_fixes (
    id TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose Down
DROP TABLE IF EXISTS data_fixes;
