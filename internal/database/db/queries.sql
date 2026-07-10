-- name: GetUser :one
SELECT * FROM user WHERE id = ? LIMIT 1;

-- name: CreateAuditLog :one
INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, ip, user_agent, metadata_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetAuditLogsForUser :many
SELECT *
FROM audit_log
WHERE user_id = ?
ORDER BY occurred_at DESC
LIMIT ?;

-- name: GetUserByUsername :one
SELECT * FROM user WHERE username = ? LIMIT 1;

-- name: CreateSession :one
INSERT INTO session (id, user_id, expires_at)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetSession :one
SELECT * FROM session WHERE id = ? LIMIT 1;

-- name: DeleteSession :exec
DELETE FROM session WHERE id = ?;

-- name: RefreshSession :exec
UPDATE session
SET expires_at = ?
WHERE id = ?;

-- name: CreateAPIToken :one
INSERT INTO api_token (id, user_id, token_hash, name)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: GetAPITokenByHash :one
SELECT * FROM api_token
WHERE token_hash = ? AND revoked_at IS NULL
LIMIT 1;

-- name: TouchAPITokenLastUsedAt :exec
UPDATE api_token
SET last_used_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- name: RevokeAllAPITokensForUser :exec
UPDATE api_token
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = ? AND revoked_at IS NULL;

-- name: UpsertAnime :one
INSERT INTO anime (id, title_original, title_english, title_japanese, image_url, banner_image_url, airing, duration_seconds)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
SELECT * FROM anime WHERE id = ? LIMIT 1;

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
SET current_episode = ?,
    current_time_seconds = ?
WHERE user_id = ? AND anime_id = ?;

-- name: UpsertContinueWatchingEntry :one
INSERT INTO continue_watching_entry (id, user_id, anime_id, current_episode, current_time_seconds, duration_seconds, updated_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT (user_id, anime_id) DO UPDATE SET
    current_episode = excluded.current_episode,
    current_time_seconds = excluded.current_time_seconds,
    duration_seconds = excluded.duration_seconds,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: GetContinueWatchingEntry :one
SELECT * FROM continue_watching_entry
WHERE user_id = ? AND anime_id = ? LIMIT 1;

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
WHERE c.user_id = ?
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
WHERE c.user_id = ?
ORDER BY c.updated_at DESC
LIMIT ?;

-- name: DeleteContinueWatchingEntry :exec
DELETE FROM continue_watching_entry
WHERE user_id = ? AND anime_id = ?;

-- name: GetWatchListEntry :one
SELECT * FROM watch_list_entry
WHERE user_id = ? AND anime_id = ? LIMIT 1;

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
WHERE e.user_id = ?
ORDER BY e.updated_at DESC;

-- name: DeleteWatchListEntry :exec
DELETE FROM watch_list_entry
WHERE user_id = ? AND anime_id = ?;

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
WHERE e.user_id = ? AND e.status IN ('watching', 'plan_to_watch') AND a.airing = 1
ORDER BY e.updated_at DESC;
-- name: GetEpisodeAvailabilityCache :one
SELECT anime_id, data, next_refresh_at, retry_until_at, last_attempt_at, last_success_at, failure_count, last_error, updated_at
FROM episode_availability_cache
WHERE anime_id = ? LIMIT 1;

-- name: UpsertEpisodeAvailabilityCache :exec
INSERT INTO episode_availability_cache (
    anime_id,
    data,
    next_refresh_at,
    retry_until_at,
    last_attempt_at,
    last_success_at,
    failure_count,
    last_error,
    updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT (anime_id) DO UPDATE SET
    data = excluded.data,
    next_refresh_at = excluded.next_refresh_at,
    retry_until_at = excluded.retry_until_at,
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = excluded.last_success_at,
    failure_count = excluded.failure_count,
    last_error = excluded.last_error,
    updated_at = CURRENT_TIMESTAMP;

-- name: MarkEpisodeAvailabilityRefreshFailed :exec
UPDATE episode_availability_cache
SET last_attempt_at = ?,
    failure_count = failure_count + 1,
    last_error = ?,
    next_refresh_at = ?,
    retry_until_at = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE anime_id = ?;

-- name: UpsertEpisodeProviderMapping :exec
INSERT INTO episode_provider_mapping (anime_id, provider, provider_show_id, failed_until, last_error, updated_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT (anime_id, provider) DO UPDATE SET
    provider_show_id = excluded.provider_show_id,
    failed_until = excluded.failed_until,
    last_error = excluded.last_error,
    updated_at = CURRENT_TIMESTAMP;

-- name: GetEpisodeProviderMapping :one
SELECT anime_id, provider, provider_show_id, failed_until, last_error, updated_at
FROM episode_provider_mapping
WHERE anime_id = ? AND provider = ? LIMIT 1;

-- name: DeleteExpiredFailedEpisodeProviderMappings :exec
DELETE FROM episode_provider_mapping
WHERE provider_show_id = ''
  AND failed_until <= CURRENT_TIMESTAMP;

-- name: GetTrackedAiringAnimeIDsDueForEpisodeRefresh :many
WITH tracked AS (
    SELECT DISTINCT w.anime_id
    FROM watch_list_entry w
    JOIN anime a ON a.id = w.anime_id
    WHERE a.airing = 1
      AND w.status IN ('watching', 'plan_to_watch')

    UNION

    SELECT DISTINCT c.anime_id
    FROM continue_watching_entry c
    JOIN anime a ON a.id = c.anime_id
    WHERE a.airing = 1
)
SELECT tracked.anime_id
FROM tracked
LEFT JOIN episode_availability_cache e ON e.anime_id = tracked.anime_id
WHERE e.anime_id IS NULL OR e.next_refresh_at IS NULL OR e.next_refresh_at <= CURRENT_TIMESTAMP
ORDER BY tracked.anime_id
LIMIT ?;

-- name: GetTrackedAiringAnimeIDs :many
SELECT tracked.anime_id
FROM (
    SELECT DISTINCT w.anime_id
    FROM watch_list_entry w
    JOIN anime a ON a.id = w.anime_id
    WHERE a.airing = 1
      AND w.status IN ('watching', 'plan_to_watch')

    UNION

    SELECT DISTINCT c.anime_id
    FROM continue_watching_entry c
    JOIN anime a ON a.id = c.anime_id
    WHERE a.airing = 1
) AS tracked
ORDER BY tracked.anime_id
LIMIT ?;
