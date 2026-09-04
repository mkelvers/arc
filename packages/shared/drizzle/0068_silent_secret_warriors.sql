ALTER TABLE "anime_provider_mapping" ADD COLUMN "inventory_status" varchar(16) DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "expected_episode_count" integer;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "provider_episode_count" integer;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "provider_episode_ids" jsonb;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "verification_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime_provider_mapping" ADD COLUMN "last_error" text;