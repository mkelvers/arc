ALTER TABLE "anime_episode" DROP COLUMN "classification";--> statement-breakpoint
ALTER TABLE "anime_episode_sync" DROP COLUMN "classification_revision";--> statement-breakpoint
ALTER TABLE "anime_episode_sync" DROP COLUMN "classifications_refreshed_at";--> statement-breakpoint
DROP TYPE "public"."episode_classification";