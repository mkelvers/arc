DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_kind') THEN
        CREATE TYPE "public"."notification_kind" AS ENUM(
            'season_announced',
            'season_available',
            'episode_available',
            'audio_available'
        );
    END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anilist_notification_target" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" varchar(32),
	"sequel_ids" integer[] DEFAULT '{}' NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"anilist_id" integer NOT NULL,
	"source_anilist_id" integer NOT NULL,
	"title" text NOT NULL,
	"episode_id" text,
	"episode_number" double precision,
	"audio" "episode_audio"[] DEFAULT '{}' NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_user_dedupe_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_interest" (
	"user_id" uuid NOT NULL,
	"anilist_id" integer NOT NULL,
	"source_anilist_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_interest_user_id_anilist_id_pk" PRIMARY KEY("user_id","anilist_id")
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'notification_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "notification"
            ADD CONSTRAINT "notification_user_id_users_id_fk"
            FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
            ON DELETE cascade ON UPDATE no action;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'notification_interest_user_id_users_id_fk'
    ) THEN
        ALTER TABLE "notification_interest"
            ADD CONSTRAINT "notification_interest_user_id_users_id_fk"
            FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
            ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_created_idx"
    ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_unread_idx"
    ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_interest_anilist_idx"
    ON "notification_interest" USING btree ("anilist_id");
