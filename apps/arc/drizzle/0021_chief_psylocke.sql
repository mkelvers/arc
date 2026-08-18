CREATE TABLE "anime_catalog" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"search_text" text NOT NULL,
	"image_url" text NOT NULL,
	"synopsis" text NOT NULL,
	"genres" text[] NOT NULL,
	"format" varchar(16),
	"status" varchar(32),
	"is_adult" boolean NOT NULL,
	"popularity" integer,
	"average_score" integer,
	"source_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_catalog_refresh" (
	"query_key" text PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anime_catalog_safe_popularity_idx" ON "anime_catalog" USING btree ("is_adult","popularity");--> statement-breakpoint
CREATE INDEX "anime_catalog_safe_score_idx" ON "anime_catalog" USING btree ("is_adult","average_score");--> statement-breakpoint
CREATE INDEX "anime_catalog_format_status_idx" ON "anime_catalog" USING btree ("format","status");