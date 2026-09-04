CREATE TABLE "anime_franchise_cache" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
WITH "poster_sources" AS (
	SELECT
		"poster"."anime_id",
		"poster"."external_id_id",
		"poster"."file_path",
		min("source"."external_id") AS "anilist_id"
	FROM "anime_release_poster" AS "poster"
	INNER JOIN "anime_external_id_link" AS "link"
		ON "link"."anime_id" = "poster"."anime_id"
	INNER JOIN "anime_external_id" AS "source"
		ON "source"."id" = "link"."external_id_id"
		AND "source"."provider" = 'anilist'
		AND "source"."media_type" = 'anime'
	WHERE "poster"."file_path" IS NOT NULL
	GROUP BY
		"poster"."anime_id",
		"poster"."external_id_id",
		"poster"."file_path"
),
"ranked_posters" AS (
	SELECT
		"anime_id",
		row_number() OVER (
			PARTITION BY "external_id_id", "file_path"
			ORDER BY "anilist_id", "anime_id"
		) AS "position"
	FROM "poster_sources"
)
UPDATE "anime_release_poster" AS "poster"
SET
	"file_path" = NULL,
	"aspect_ratio" = NULL,
	"height" = NULL,
	"language" = NULL,
	"vote_average" = NULL,
	"width" = NULL,
	"fetched_at" = to_timestamp(0)
FROM "ranked_posters"
WHERE
	"ranked_posters"."anime_id" = "poster"."anime_id"
	AND "ranked_posters"."position" > 1;
--> statement-breakpoint
UPDATE "anime_release_poster"
SET "fetched_at" = to_timestamp(0)
WHERE
	"file_path" IS NOT NULL
	AND ("width" < 1000 OR "height" < 1500);
--> statement-breakpoint
CREATE UNIQUE INDEX "anime_release_poster_external_file_unique" ON "anime_release_poster" USING btree ("external_id_id","file_path");
