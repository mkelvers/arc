CREATE TABLE "anime_airing_schedule" (
	"airing_id" integer PRIMARY KEY NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" integer NOT NULL,
	"airing_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"source_fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduler_heartbeat" ADD COLUMN "last_calendar_refresh_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduler_heartbeat" ADD COLUMN "next_calendar_refresh_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "anime_airing_schedule_airing_at_idx" ON "anime_airing_schedule" USING btree ("airing_at");--> statement-breakpoint
CREATE INDEX "anime_airing_schedule_anilist_idx" ON "anime_airing_schedule" USING btree ("anilist_id");