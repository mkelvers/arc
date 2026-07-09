-- +goose Up
ALTER TABLE watch_list_entry ADD COLUMN completed_at DATETIME;
ALTER TABLE watch_list_entry ADD COLUMN completed_at_estimated BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE watch_list_entry
SET completed_at = COALESCE(
        (
            SELECT MAX(a.occurred_at)
            FROM audit_log a
            WHERE a.user_id = watch_list_entry.user_id
              AND a.action = 'watch_completed'
              AND a.resource_type = 'anime'
              AND a.resource_id = CAST(watch_list_entry.anime_id AS TEXT)
        ),
        watch_list_entry.updated_at
    ),
    completed_at_estimated = CASE
        WHEN EXISTS (
            SELECT 1
            FROM audit_log a
            WHERE a.user_id = watch_list_entry.user_id
              AND a.action = 'watch_completed'
              AND a.resource_type = 'anime'
              AND a.resource_id = CAST(watch_list_entry.anime_id AS TEXT)
        ) THEN FALSE
        ELSE TRUE
    END
WHERE status = 'completed';

-- +goose Down
ALTER TABLE watch_list_entry DROP COLUMN completed_at_estimated;
ALTER TABLE watch_list_entry DROP COLUMN completed_at;
