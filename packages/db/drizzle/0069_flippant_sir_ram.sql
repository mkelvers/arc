ALTER TABLE "anime_provider_mapping" ALTER COLUMN "verified_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ALTER COLUMN "verified_at" DROP NOT NULL;