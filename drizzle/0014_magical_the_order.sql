ALTER TABLE "anime_external_id_link" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "tmdb_mapping_version";
