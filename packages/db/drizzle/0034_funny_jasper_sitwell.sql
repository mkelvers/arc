CREATE TABLE "sync_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"automatic_sync" boolean DEFAULT false NOT NULL,
	"episode_progress" boolean DEFAULT false NOT NULL,
	"watching_status" boolean DEFAULT false NOT NULL,
	"import_anilist_changes" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;