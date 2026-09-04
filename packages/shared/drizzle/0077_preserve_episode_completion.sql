ALTER TABLE "playback_progress"
	ADD COLUMN "has_completed" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "playback_progress"
	ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "playback_progress"
SET
	"has_completed" = "completed",
	"completed_at" = CASE WHEN "completed" THEN "updated_at" ELSE NULL END
WHERE "completed"; 
