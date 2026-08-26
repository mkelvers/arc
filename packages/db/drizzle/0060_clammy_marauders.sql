CREATE TABLE "anilist_request_state" (
	"name" text PRIMARY KEY NOT NULL,
	"next_request_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"lease_owner" uuid,
	"lease_until" timestamp with time zone,
	"last_request_at" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduler_heartbeat" ADD COLUMN "next_full_reconciliation_at" timestamp with time zone;