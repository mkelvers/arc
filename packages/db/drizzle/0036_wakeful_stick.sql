CREATE TABLE "anime_card_cache" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_simulcast_page_cache" (
	"season" varchar(8) NOT NULL,
	"year" integer NOT NULL,
	"page" integer NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_simulcast_page_cache_season_year_page_pk" PRIMARY KEY("season","year","page")
);
