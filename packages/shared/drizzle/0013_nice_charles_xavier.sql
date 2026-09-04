DELETE FROM "users" AS "user"
WHERE "user"."email" LIKE '%@legacy.invalid'
	AND NOT EXISTS (
		SELECT 1
		FROM "accounts"
		WHERE "accounts"."user_id" = "user"."id"
	);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_username" text;--> statement-breakpoint
UPDATE "users"
SET
	"username" = COALESCE(
		"username",
		'u_' || left(replace("id"::text, '-', ''), 28)
	),
	"display_username" = COALESCE(
		"display_username",
		NULLIF("name", ''),
		'u_' || left(replace("id"::text, '-', ''), 28)
	);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_username" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'users_username_unique'
			AND conrelid = 'users'::regclass
	) THEN
		ALTER TABLE "users"
			ADD CONSTRAINT "users_username_unique" UNIQUE("username");
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'accounts_provider_account_unique'
			AND conrelid = 'accounts'::regclass
	) THEN
		ALTER TABLE "accounts"
			ADD CONSTRAINT "accounts_provider_account_unique"
			UNIQUE("provider_id", "account_id");
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "watchlist"
	ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
UPDATE "watchlist"
SET "id" = gen_random_uuid()
WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "watchlist" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "watchlist" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'watchlist_user_id_anime_id_pk'
			AND conrelid = 'watchlist'::regclass
	) THEN
		ALTER TABLE "watchlist"
			DROP CONSTRAINT "watchlist_user_id_anime_id_pk";
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE contype = 'p'
			AND conrelid = 'watchlist'::regclass
	) THEN
		ALTER TABLE "watchlist"
			ADD CONSTRAINT "watchlist_pkey" PRIMARY KEY("id");
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'watchlist_user_anime_unique'
			AND conrelid = 'watchlist'::regclass
	) THEN
		ALTER TABLE "watchlist"
			ADD CONSTRAINT "watchlist_user_anime_unique"
			UNIQUE("user_id", "anime_id");
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_user_updated_idx"
	ON "watchlist" USING btree ("user_id", "updated_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playback_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"anime_id" integer NOT NULL,
	"episode_id" text NOT NULL,
	"episode_number" double precision NOT NULL,
	"position_seconds" double precision NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_progress_user_anime_unique"
		UNIQUE("user_id", "anime_id"),
	CONSTRAINT "playback_progress_user_id_users_id_fk"
		FOREIGN KEY ("user_id")
		REFERENCES "public"."users"("id")
		ON DELETE cascade
		ON UPDATE no action,
	CONSTRAINT "playback_progress_anime_id_anime_id_fk"
		FOREIGN KEY ("anime_id")
		REFERENCES "public"."anime"("id")
		ON DELETE cascade
		ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playback_progress_user_watched_idx"
	ON "playback_progress" USING btree ("user_id", "last_watched_at");
