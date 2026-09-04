ALTER TABLE "playback_progress"
	DROP CONSTRAINT IF EXISTS "playback_progress_user_anime_unique";--> statement-breakpoint
ALTER TABLE "playback_progress"
	ADD CONSTRAINT "playback_progress_user_anime_episode_unique"
		UNIQUE("user_id", "anime_id", "episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playback_progress_user_anime_watched_idx"
	ON "playback_progress" USING btree ("user_id", "anime_id", "last_watched_at");
