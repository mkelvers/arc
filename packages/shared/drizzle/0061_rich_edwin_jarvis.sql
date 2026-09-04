ALTER TABLE "anilist_request_state" ADD COLUMN "last_operation" text;--> statement-breakpoint
ALTER TABLE "anilist_request_state" ADD COLUMN "request_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anilist_request_state" ADD COLUMN "success_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anilist_request_state" ADD COLUMN "failure_count" bigint DEFAULT 0 NOT NULL;