CREATE TABLE "anime_artwork_source" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"source_anilist_id" integer NOT NULL
);
--> statement-breakpoint
INSERT INTO "anime_artwork_source" ("anilist_id", "source_anilist_id")
VALUES (124080, 163132);
