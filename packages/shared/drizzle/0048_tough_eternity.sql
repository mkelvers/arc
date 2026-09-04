CREATE TYPE "public"."episode_classification" AS ENUM('canon', 'mixed', 'filler', 'recap', 'anime-canon', 'unknown');--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "classification" "episode_classification" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_episode_sync" ADD COLUMN "classifications_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime_episode_sync" ADD COLUMN "classification_revision" text;
