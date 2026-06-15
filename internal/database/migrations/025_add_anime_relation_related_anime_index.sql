-- +goose Up
CREATE INDEX IF NOT EXISTS idx_anime_relation_related_anime_id
ON anime_relation(related_anime_id);

-- +goose Down
DROP INDEX IF EXISTS idx_anime_relation_related_anime_id;
