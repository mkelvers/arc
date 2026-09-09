ALTER TABLE "anime_episode" ADD COLUMN "opening_skip_times_source" varchar(16);--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "ending_skip_times_source" varchar(16);--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "opening_skip_times_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "ending_skip_times_fetched_at" timestamp with time zone;