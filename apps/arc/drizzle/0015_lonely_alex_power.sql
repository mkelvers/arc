ALTER TABLE "anime_episode_sync" ADD COLUMN "metadata_external_id_id" integer;--> statement-breakpoint
ALTER TABLE "anime_episode_sync" ADD CONSTRAINT "anime_episode_sync_metadata_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("metadata_external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_episode_sync" DROP COLUMN "version";--> statement-breakpoint
UPDATE "anime_episode_sync" SET "next_refresh_at" = now();
