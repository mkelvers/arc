CREATE TABLE "anime_details_cache" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_episode_cache" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"episodes" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
