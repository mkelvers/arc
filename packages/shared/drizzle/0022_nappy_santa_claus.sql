CREATE TABLE "anime_catalog_taxonomy" (
	"provider" varchar(32) PRIMARY KEY NOT NULL,
	"genres" text[] NOT NULL,
	"formats" text[] NOT NULL,
	"statuses" text[] NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
