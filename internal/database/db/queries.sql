-- name: GetUser :one
SELECT * FROM "user" WHERE id = $1 LIMIT 1;

-- name: GetUserByUsername :one
SELECT * FROM "user" WHERE username = $1 LIMIT 1;

-- name: CreateSession :one
INSERT INTO session (id, user_id, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSession :one
SELECT * FROM session WHERE id = $1 LIMIT 1;

-- name: DeleteSession :exec
DELETE FROM session WHERE id = $1;

-- name: RefreshSession :exec
UPDATE session
SET expires_at = $1
WHERE id = $2;

-- name: CreateAPIToken :one
INSERT INTO api_token (id, user_id, token_hash, name)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetAPITokenByHash :one
SELECT * FROM api_token
WHERE token_hash = $1 AND revoked_at IS NULL
LIMIT 1;

-- name: TouchAPITokenLastUsedAt :exec
UPDATE api_token
SET last_used_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: RevokeAllAPITokensForUser :exec
UPDATE api_token
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: UpsertAnime :one
INSERT INTO anime (id, title_original, title_english, title_japanese, image_url, banner_image_url, airing, duration_seconds)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (id) DO UPDATE SET
    title_original = excluded.title_original,
    title_english = excluded.title_english,
    title_japanese = excluded.title_japanese,
    image_url = excluded.image_url,
    banner_image_url = CASE
        WHEN excluded.banner_image_url <> '' THEN excluded.banner_image_url
        ELSE anime.banner_image_url
    END,
    airing = excluded.airing,
    duration_seconds = excluded.duration_seconds
RETURNING *;

-- name: GetAnime :one
SELECT * FROM anime WHERE id = $1 LIMIT 1;

-- name: UpsertWatchListEntry :one
INSERT INTO watch_list_entry (id, user_id, anime_id, status, current_episode, current_time_seconds, completed_at, completed_at_estimated, updated_at)
VALUES (
    sqlc.arg(id),
    sqlc.arg(user_id),
    sqlc.arg(anime_id),
    sqlc.arg(status),
    sqlc.arg(current_episode),
    sqlc.arg(current_time_seconds),
    CASE WHEN sqlc.arg(status) = 'completed' THEN CURRENT_TIMESTAMP END,
    FALSE,
    CURRENT_TIMESTAMP
)
ON CONFLICT (user_id, anime_id) DO UPDATE SET
    status = excluded.status,
    current_episode = excluded.current_episode,
    current_time_seconds = excluded.current_time_seconds,
    completed_at = CASE
        WHEN excluded.status != 'completed' THEN NULL
        WHEN watch_list_entry.status = 'completed' THEN COALESCE(watch_list_entry.completed_at, CURRENT_TIMESTAMP)
        ELSE CURRENT_TIMESTAMP
    END,
    completed_at_estimated = CASE
        WHEN excluded.status = 'completed' AND watch_list_entry.status = 'completed'
            THEN watch_list_entry.completed_at_estimated
        ELSE FALSE
    END,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: SaveWatchProgress :exec
UPDATE watch_list_entry
SET current_episode = $1,
    current_time_seconds = $2
WHERE user_id = $3 AND anime_id = $4;

-- name: UpsertContinueWatchingEntry :one
INSERT INTO continue_watching_entry (id, user_id, anime_id, current_episode, current_time_seconds, duration_seconds, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
ON CONFLICT (user_id, anime_id) DO UPDATE SET
    current_episode = excluded.current_episode,
    current_time_seconds = excluded.current_time_seconds,
    duration_seconds = excluded.duration_seconds,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: GetContinueWatchingEntry :one
SELECT * FROM continue_watching_entry
WHERE user_id = $1 AND anime_id = $2 LIMIT 1;

-- name: GetContinueWatchingEntries :many
SELECT
    c.id,
    c.user_id,
    c.anime_id,
    c.current_episode,
    c.current_time_seconds,
    c.duration_seconds,
    c.created_at,
    c.updated_at,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.banner_image_url,
    a.duration_seconds as anime_duration_seconds
FROM continue_watching_entry c
JOIN anime a ON c.anime_id = a.id
WHERE c.user_id = $1
ORDER BY c.updated_at DESC;

-- name: GetContinueWatchingCarouselEntries :many
SELECT
    c.id,
    c.user_id,
    c.anime_id,
    c.current_episode,
    c.current_time_seconds,
    c.duration_seconds,
    c.created_at,
    c.updated_at,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.banner_image_url,
    a.duration_seconds as anime_duration_seconds
FROM continue_watching_entry c
JOIN anime a ON c.anime_id = a.id
WHERE c.user_id = $1
ORDER BY c.updated_at DESC
LIMIT $2;

-- name: DeleteContinueWatchingEntry :exec
DELETE FROM continue_watching_entry
WHERE user_id = $1 AND anime_id = $2;

-- name: GetWatchListEntry :one
SELECT * FROM watch_list_entry
WHERE user_id = $1 AND anime_id = $2 LIMIT 1;

-- name: GetUserWatchList :many
SELECT 
    e.id,
    e.user_id,
    e.anime_id,
    e.status,
    e.created_at,
    e.updated_at,
    e.current_episode,
    e.last_episode_at,
    e.current_time_seconds,
    e.completed_at,
    e.completed_at_estimated,
    c.current_episode AS playback_current_episode,
    c.current_time_seconds AS playback_current_time_seconds,
    c.updated_at AS playback_updated_at,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.airing
FROM watch_list_entry e
JOIN anime a ON e.anime_id = a.id
LEFT JOIN continue_watching_entry c ON c.user_id = e.user_id AND c.anime_id = e.anime_id
WHERE e.user_id = $1
ORDER BY e.updated_at DESC;

-- name: DeleteWatchListEntry :exec
DELETE FROM watch_list_entry
WHERE user_id = $1 AND anime_id = $2;

-- name: GetWatchingAnime :many
SELECT 
    e.*,
    a.title_original,
    a.title_english,
    a.title_japanese,
    a.image_url,
    a.airing
FROM watch_list_entry e
JOIN anime a ON e.anime_id = a.id
WHERE e.user_id = $1 AND e.status IN ('watching', 'plan_to_watch') AND a.airing = TRUE
ORDER BY e.updated_at DESC;
-- name: GetTrackedAiringAnimeIDs :many
SELECT tracked.anime_id
FROM (
    SELECT DISTINCT w.anime_id
    FROM watch_list_entry w
    JOIN anime a ON a.id = w.anime_id
    WHERE a.airing = TRUE
      AND w.status IN ('watching', 'plan_to_watch')

    UNION

    SELECT DISTINCT c.anime_id
    FROM continue_watching_entry c
    JOIN anime a ON a.id = c.anime_id
    WHERE a.airing = TRUE
) AS tracked
ORDER BY tracked.anime_id
LIMIT $1;
