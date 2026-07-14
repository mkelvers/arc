-- +goose Up

DROP TABLE IF EXISTS episode_provider_mapping;
DROP TABLE IF EXISTS episode_availability_cache;
DROP TABLE IF EXISTS anime_relation;
DROP TABLE IF EXISTS anime_fetch_retry;
DROP TABLE IF EXISTS jikan_cache;

-- +goose Down

-- Provider caches are rebuilt in Redis.
