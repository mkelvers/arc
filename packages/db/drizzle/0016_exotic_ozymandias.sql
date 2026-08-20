ALTER TABLE "anime_episode" ADD COLUMN "opening_start_seconds" double precision;--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "opening_end_seconds" double precision;--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "ending_start_seconds" double precision;--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "ending_end_seconds" double precision;--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "skip_times_source" varchar(16);--> statement-breakpoint
ALTER TABLE "anime_episode" ADD COLUMN "skip_times_fetched_at" timestamp with time zone;