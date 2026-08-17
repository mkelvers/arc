CREATE TYPE "public"."episode_audio" AS ENUM('sub', 'dub', 'raw');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_episode" (
	"anilist_id" integer NOT NULL,
	"episode_id" text NOT NULL,
	"number" double precision NOT NULL,
	"provider_title" text,
	"metadata_title" text,
	"audio" "episode_audio"[] NOT NULL,
	"image_url" text,
	"runtime_minutes" integer,
	"air_date" text,
	"overview" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_episode_anilist_id_episode_id_pk" PRIMARY KEY("anilist_id","episode_id")
);
--> statement-breakpoint
CREATE TABLE "anime_episode_sync" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"media_status" varchar(32),
	"expected_episodes" integer,
	"source_revision" text,
	"stable_since" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"next_refresh_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_playback_provider" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"allanime_show_id" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "anime_episode" (
	"anilist_id",
	"episode_id",
	"number",
	"metadata_title",
	"audio",
	"image_url",
	"runtime_minutes",
	"air_date",
	"overview",
	"first_seen_at",
	"last_seen_at",
	"last_verified_at"
)
SELECT
	cache."anilist_id",
	episode->>'id',
	(episode->>'number')::double precision,
	NULLIF(episode->>'title', ''),
	(
		CASE
			WHEN COALESCE((episode->>'hasSub')::boolean, false)
			THEN ARRAY['sub']::"episode_audio"[]
			ELSE ARRAY[]::"episode_audio"[]
		END
		||
		CASE
			WHEN COALESCE((episode->>'hasDub')::boolean, false)
			THEN ARRAY['dub']::"episode_audio"[]
			ELSE ARRAY[]::"episode_audio"[]
		END
	),
	NULLIF(episode->>'imageUrl', ''),
	CASE
		WHEN episode->>'duration' ~ '^[0-9]+m$'
			THEN regexp_replace(episode->>'duration', 'm$', '')::integer
		WHEN episode->>'duration' ~ '^[0-9]+h$'
			THEN regexp_replace(episode->>'duration', 'h$', '')::integer * 60
		WHEN episode->>'duration' ~ '^[0-9]+h, [0-9]+m$'
			THEN split_part(episode->>'duration', 'h', 1)::integer * 60
				+ regexp_replace(split_part(episode->>'duration', ', ', 2), 'm$', '')::integer
		ELSE NULL
	END,
	NULLIF(episode->>'airDate', ''),
	NULLIF(episode->>'overview', ''),
	cache."fetched_at",
	cache."fetched_at",
	cache."fetched_at"
FROM "anime_episode_cache" cache
CROSS JOIN LATERAL jsonb_array_elements(cache."episodes") episode
WHERE NULLIF(episode->>'id', '') IS NOT NULL
	AND episode->>'number' ~ '^[0-9]+(\.[0-9]+)?$'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "anime_episode_sync" (
	"anilist_id",
	"media_status",
	"expected_episodes",
	"stable_since",
	"last_success_at",
	"next_refresh_at",
	"version"
)
SELECT
	cache."anilist_id",
	details."data"->>'status',
	CASE
		WHEN details."data"->>'episodes' ~ '^[0-9]+$'
			THEN (details."data"->>'episodes')::integer
		ELSE NULL
	END,
	cache."fetched_at",
	cache."fetched_at",
	now(),
	1
FROM "anime_episode_cache" cache
LEFT JOIN "anime_details_cache" details USING ("anilist_id")
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "anime_episode_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "anime_episode_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'accounts_user_id_users_id_fk'
			AND conrelid = 'accounts'::regclass
	) THEN
		ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'sessions_user_id_users_id_fk'
			AND conrelid = 'sessions'::regclass
	) THEN
		ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anime_episode_anilist_number_idx" ON "anime_episode" USING btree ("anilist_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'users_email_unique'
			AND conrelid = 'users'::regclass
	) THEN
		ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
	END IF;
END $$;
