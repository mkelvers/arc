-- +goose Up
ALTER TABLE anime ADD COLUMN IF NOT EXISTS banner_image_url TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE anime DROP COLUMN IF EXISTS banner_image_url;
