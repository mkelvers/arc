-- +goose Up
-- Add airing status column to anime table
ALTER TABLE anime ADD COLUMN airing BOOLEAN DEFAULT 0;

-- +goose Down
