ALTER TABLE "anime_episode_sync" ADD COLUMN "next_airing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime_episode_sync" ADD COLUMN "next_airing_episode" integer;