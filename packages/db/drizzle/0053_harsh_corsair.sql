CREATE TYPE "public"."anime_episode_target_state" AS ENUM('pending', 'confirmed', 'failed', 'retired');--> statement-breakpoint
CREATE TYPE "public"."maintenance_task_kind" AS ENUM('release_refresh', 'mapping_rediscover', 'mapping_override', 'target_reactivate', 'interest_reconcile');--> statement-breakpoint
CREATE TYPE "public"."maintenance_task_state" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mapping_override_kind" AS ENUM('playback', 'metadata');--> statement-breakpoint
CREATE TYPE "public"."mapping_validation_status" AS ENUM('pending', 'valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."scheduler_interest_source" AS ENUM('watchlist', 'continue_watching');--> statement-breakpoint
CREATE TABLE "anime_episode_target" (
	"anilist_id" integer NOT NULL,
	"target_episode" integer NOT NULL,
	"expected_episodes" integer,
	"airing_at" timestamp with time zone NOT NULL,
	"first_scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"state" "anime_episode_target_state" DEFAULT 'pending' NOT NULL,
	"inventory_revision" text,
	"confirmed_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_episode_target_anilist_id_target_episode_pk" PRIMARY KEY("anilist_id","target_episode")
);
--> statement-breakpoint
CREATE TABLE "anime_interest_dirty" (
	"user_id" uuid NOT NULL,
	"anime_id" integer NOT NULL,
	"dirty_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_interest_dirty_user_id_anime_id_pk" PRIMARY KEY("user_id","anime_id")
);
--> statement-breakpoint
CREATE TABLE "anime_mapping_override" (
	"anilist_id" integer NOT NULL,
	"kind" "mapping_override_kind" NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_id" text NOT NULL,
	"media_type" varchar(16),
	"previous_mapping" jsonb,
	"validation_status" "mapping_validation_status" DEFAULT 'pending' NOT NULL,
	"validation_evidence" jsonb,
	"maintenance_actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "anime_mapping_override_anilist_id_kind_provider_pk" PRIMARY KEY("anilist_id","kind","provider")
);
--> statement-breakpoint
CREATE TABLE "anime_release" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb,
	"title" text NOT NULL,
	"image_url" text,
	"status" varchar(32),
	"format" varchar(16),
	"mal_id" integer,
	"episode_count" integer,
	"duration_minutes" integer,
	"next_airing_at" timestamp with time zone,
	"next_airing_episode" integer,
	"schema_revision" integer DEFAULT 1 NOT NULL,
	"source_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_release_interest" (
	"user_id" uuid NOT NULL,
	"source" "scheduler_interest_source" NOT NULL,
	"source_anime_id" integer NOT NULL,
	"tracked_anilist_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_release_interest_user_id_source_source_anime_id_tracked_anilist_id_pk" PRIMARY KEY("user_id","source","source_anime_id","tracked_anilist_id")
);
--> statement-breakpoint
CREATE TABLE "anime_release_request" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "maintenance_task_kind" NOT NULL,
	"dedupe_key" text,
	"payload" jsonb NOT NULL,
	"state" "maintenance_task_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "maintenance_task_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "scheduler_heartbeat" (
	"name" text PRIMARY KEY NOT NULL,
	"active_run_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_full_reconciliation_at" timestamp with time zone,
	"last_error" text,
	"stats" jsonb
);
--> statement-breakpoint
ALTER TABLE "anime_episode_target" ADD CONSTRAINT "anime_episode_target_anilist_id_anime_release_anilist_id_fk" FOREIGN KEY ("anilist_id") REFERENCES "public"."anime_release"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_interest_dirty" ADD CONSTRAINT "anime_interest_dirty_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_interest_dirty" ADD CONSTRAINT "anime_interest_dirty_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_mapping_override" ADD CONSTRAINT "anime_mapping_override_anilist_id_anime_release_anilist_id_fk" FOREIGN KEY ("anilist_id") REFERENCES "public"."anime_release"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_release_interest" ADD CONSTRAINT "anime_release_interest_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_release_interest" ADD CONSTRAINT "anime_release_interest_source_anime_id_anime_id_fk" FOREIGN KEY ("source_anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_release_interest" ADD CONSTRAINT "anime_release_interest_tracked_anilist_id_anime_release_anilist_id_fk" FOREIGN KEY ("tracked_anilist_id") REFERENCES "public"."anime_release"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_episode_target_due_idx" ON "anime_episode_target" USING btree ("state","next_attempt_at","lease_until");--> statement-breakpoint
CREATE INDEX "anime_interest_dirty_time_idx" ON "anime_interest_dirty" USING btree ("dirty_at");--> statement-breakpoint
CREATE INDEX "anime_release_status_airing_idx" ON "anime_release" USING btree ("status","next_airing_at");--> statement-breakpoint
CREATE INDEX "anime_release_mal_idx" ON "anime_release" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "anime_release_interest_tracked_idx" ON "anime_release_interest" USING btree ("tracked_anilist_id");--> statement-breakpoint
CREATE INDEX "anime_release_interest_source_idx" ON "anime_release_interest" USING btree ("user_id","source_anime_id");--> statement-breakpoint
CREATE INDEX "anime_release_request_due_idx" ON "anime_release_request" USING btree ("next_attempt_at","lease_until");--> statement-breakpoint
CREATE INDEX "maintenance_task_due_idx" ON "maintenance_task" USING btree ("state","next_attempt_at","lease_until");
--> statement-breakpoint
INSERT INTO "anime_release" (
	"anilist_id", "data", "title", "image_url", "status", "format", "mal_id",
	"episode_count", "duration_minutes", "next_airing_at", "next_airing_episode",
	"schema_revision", "source_fetched_at", "created_at", "updated_at"
)
SELECT
	details."anilist_id",
	details."data",
	coalesce(
		nullif(details."data" #>> '{title,english}', ''),
		nullif(details."data" #>> '{title,romaji}', ''),
		nullif(details."data" #>> '{title,native}', ''),
		'Anime ' || details."anilist_id"
	),
	coalesce(
		nullif(details."data" #>> '{coverImage,extraLarge}', ''),
		nullif(details."data" #>> '{coverImage,large}', ''),
		nullif(cards."data"->>'image', ''),
		nullif(details."data"->>'bannerImage', '')
	),
	details."data"->>'status',
	details."data"->>'format',
	CASE WHEN (details."data"->>'idMal') ~ '^[0-9]+$' THEN (details."data"->>'idMal')::integer END,
	CASE WHEN (details."data"->>'episodes') ~ '^[0-9]+$' THEN (details."data"->>'episodes')::integer END,
	CASE WHEN (details."data"->>'duration') ~ '^[0-9]+$' THEN (details."data"->>'duration')::integer END,
	CASE
		WHEN (details."data" #>> '{nextAiringEpisode,airingAt}') ~ '^[0-9]+$'
		THEN to_timestamp((details."data" #>> '{nextAiringEpisode,airingAt}')::double precision)
	END,
	CASE
		WHEN (details."data" #>> '{nextAiringEpisode,episode}') ~ '^[0-9]+$'
		THEN (details."data" #>> '{nextAiringEpisode,episode}')::integer
	END,
	1,
	details."fetched_at",
	details."fetched_at",
	details."fetched_at"
FROM "anime_details_cache" details
LEFT JOIN "anime_card_cache" cards ON cards."anilist_id" = details."anilist_id"
WHERE jsonb_typeof(details."data") = 'object'
	AND (details."data"->>'id') ~ '^[0-9]+$'
	AND (details."data"->>'id')::integer = details."anilist_id";
--> statement-breakpoint
INSERT INTO "anime_release" (
	"anilist_id", "title", "image_url", "status", "format", "source_fetched_at",
	"created_at", "updated_at"
)
SELECT
	cards."anilist_id",
	coalesce(nullif(cards."data"->>'title', ''), 'Anime ' || cards."anilist_id"),
	nullif(cards."data"->>'image', ''),
	cards."data"->>'status',
	cards."data"->>'format',
	cards."fetched_at",
	cards."fetched_at",
	cards."fetched_at"
FROM "anime_card_cache" cards
WHERE jsonb_typeof(cards."data") = 'object'
	AND coalesce((cards."data"->>'id') ~ '^[0-9]+$', false)
	AND (cards."data"->>'id')::integer = cards."anilist_id"
ON CONFLICT ("anilist_id") DO UPDATE SET
	"image_url" = coalesce("anime_release"."image_url", excluded."image_url"),
	"title" = CASE
		WHEN "anime_release"."title" = 'Anime ' || "anime_release"."anilist_id"
		THEN excluded."title"
		ELSE "anime_release"."title"
	END;
--> statement-breakpoint
INSERT INTO "anime_release" (
	"anilist_id", "title", "image_url", "status", "format", "source_fetched_at",
	"created_at", "updated_at"
)
SELECT
	catalog."anilist_id",
	catalog."title",
	catalog."image_url",
	catalog."status",
	catalog."format",
	catalog."source_fetched_at",
	catalog."created_at",
	catalog."updated_at"
FROM "anime_catalog" catalog
ON CONFLICT ("anilist_id") DO UPDATE SET
	"image_url" = coalesce("anime_release"."image_url", excluded."image_url"),
	"title" = CASE
		WHEN "anime_release"."title" = 'Anime ' || "anime_release"."anilist_id"
		THEN excluded."title"
		ELSE "anime_release"."title"
	END;
--> statement-breakpoint
INSERT INTO "anime_interest_dirty" ("user_id", "anime_id", "dirty_at")
SELECT "user_id", "anime_id", now()
FROM "watchlist"
WHERE "state" <> 'dropped'
UNION
SELECT "user_id", "anime_id", now()
FROM "playback_progress"
WHERE "dismissed_at" IS NULL
ON CONFLICT ("user_id", "anime_id") DO UPDATE SET "dirty_at" = excluded."dirty_at";
