CREATE TABLE "anime_simulcast_page_cache" (
	"provider" varchar(32) NOT NULL,
	"season" varchar(8) NOT NULL,
	"year" integer NOT NULL,
	"page" integer NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_simulcast_page_cache_provider_season_year_page_pk" PRIMARY KEY("provider","season","year","page")
);
