CREATE TABLE "anime_recent_visit" (
	"user_id" uuid NOT NULL,
	"anilist_id" integer NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_recent_visit_user_id_anilist_id_pk" PRIMARY KEY("user_id","anilist_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_heartbeat" (
	"name" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "anime_episode_refresh" ADD COLUMN "first_scheduled_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_episode_refresh" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime_recent_visit" ADD CONSTRAINT "anime_recent_visit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_recent_visit_time_idx" ON "anime_recent_visit" USING btree ("visited_at");