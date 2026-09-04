ALTER TABLE "anime_episode_sync"
ADD COLUMN IF NOT EXISTS "metadata_revision" text;
