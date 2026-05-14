-- +goose Up
ALTER TABLE user ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';

UPDATE user SET avatar_url = 'https://api.dicebear.com/9.x/dylan/svg?seed=' || username WHERE avatar_url = '';
-- +goose Down
