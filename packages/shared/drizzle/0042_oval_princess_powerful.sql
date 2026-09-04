CREATE TABLE "anilist_publication" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "anime_episode_refresh" (
	"anilist_id" integer NOT NULL,
	"target_episode" integer NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "anime_episode_refresh_anilist_id_target_episode_pk" PRIMARY KEY("anilist_id","target_episode")
);
--> statement-breakpoint
CREATE TABLE "maintenance_task" (
	"name" text PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "anilist_publication" ADD CONSTRAINT "anilist_publication_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_episode_refresh" ADD CONSTRAINT "anime_episode_refresh_anilist_id_anime_episode_sync_anilist_id_fk" FOREIGN KEY ("anilist_id") REFERENCES "public"."anime_episode_sync"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anilist_publication_due_idx" ON "anilist_publication" USING btree ("next_attempt_at","lease_until");--> statement-breakpoint
CREATE INDEX "anime_episode_refresh_due_idx" ON "anime_episode_refresh" USING btree ("run_at","lease_until");