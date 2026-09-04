CREATE TYPE "public"."episode_text_source" AS ENUM('tmdb', 'machine');--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "metadata_title_source" "episode_text_source";--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "overview_source" "episode_text_source";--> statement-breakpoint
UPDATE "anime_episode_sync" SET "next_refresh_at" = now();
