-- +goose Up
ALTER TABLE anime ADD COLUMN banner_image_url TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE anime DROP COLUMN banner_image_url;
