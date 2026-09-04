-- Rebuild persisted episode audio availability from the sole AniKoto provider.
INSERT INTO "maintenance_task" ("kind", "dedupe_key", "payload")
SELECT
    'episode_backfill',
    'episode:backfill:' || release."anilist_id",
    jsonb_build_object('kind', 'episode_backfill', 'anilistId', release."anilist_id")
FROM "anime_release" release
WHERE release."data" IS NOT NULL
  AND release."status" IN ('RELEASING', 'FINISHED')
  AND EXISTS (
      SELECT 1
      FROM "anime_episode" episode
      WHERE episode."anilist_id" = release."anilist_id"
  )
ON CONFLICT ("dedupe_key") DO UPDATE
SET "state" = 'pending',
    "attempts" = 0,
    "next_attempt_at" = NOW(),
    "lease_owner" = NULL,
    "lease_until" = NULL,
    "last_error" = NULL,
    "result" = NULL,
    "completed_at" = NULL,
    "updated_at" = NOW()
WHERE "maintenance_task"."state" <> 'running';
