CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "anime_search_index" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"search_text" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anime_search_index_text_idx" ON "anime_search_index" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
INSERT INTO "anime_search_index" ("anilist_id", "search_text", "data")
SELECT
	"anilist_id",
	lower("search_text"),
	jsonb_build_object(
		'id', "anilist_id",
		'href', '/anime/' || "anilist_id",
		'link', '/anime/' || "anilist_id",
		'title', "title",
		'titles', to_jsonb(string_to_array("search_text", E'\n')),
		'image', "image_url",
		'audioLabel', '',
		'score', coalesce("average_score", 0),
		'genres', to_jsonb("genres"),
		'synopsis', "synopsis",
		'format', "format",
		'popularity', coalesce("popularity", 0),
		'backdrop', null,
		'artworkGroup', null,
		'relatedIds', '[]'::jsonb
	)
FROM "anime_catalog";
--> statement-breakpoint
INSERT INTO "anime_search_index" ("anilist_id", "search_text", "data")
SELECT
	details."anilist_id",
	lower(concat_ws(
		E'\n',
		details."data" #>> '{title,english}',
		details."data" #>> '{title,romaji}',
		details."data" #>> '{title,native}',
		(SELECT string_agg(value #>> '{}', E'\n') FROM jsonb_array_elements(coalesce(details."data"->'synonyms', '[]'::jsonb)))
	)),
	jsonb_build_object(
		'id', details."anilist_id",
		'href', '/anime/' || details."anilist_id",
		'link', '/anime/' || details."anilist_id",
		'title', coalesce(
			details."data" #>> '{title,english}',
			details."data" #>> '{title,romaji}',
			details."data" #>> '{title,native}',
			'Anime ' || details."anilist_id"
		),
		'titles', to_jsonb(array_remove(ARRAY[
			details."data" #>> '{title,english}',
			details."data" #>> '{title,romaji}',
			details."data" #>> '{title,native}'
		], null)) || jsonb_path_query_array(coalesce(details."data"->'synonyms', '[]'::jsonb), '$[*] ? (@ != null)'),
		'image', coalesce(
			cards."data"->>'image',
			posters."image_url",
			details."data"->>'bannerImage'
		),
		'audioLabel', '',
		'score', coalesce((details."data"->>'averageScore')::integer, 0),
		'genres', jsonb_path_query_array(coalesce(details."data"->'genres', '[]'::jsonb), '$[*] ? (@ != null)'),
		'synopsis', regexp_replace(coalesce(details."data"->>'description', ''), '<[^>]*>', '', 'g'),
		'format', details."data"->>'format',
		'popularity', coalesce((details."data"->>'popularity')::integer, 0),
		'backdrop', null,
		'artworkGroup', null,
		'relatedIds', '[]'::jsonb
	)
FROM "anime_details_cache" details
LEFT JOIN "anime_card_cache" cards ON cards."anilist_id" = details."anilist_id"
LEFT JOIN LATERAL (
	SELECT 'https://image.tmdb.org/t/p/w500' || poster."file_path" AS "image_url"
	FROM "anime_release_poster" poster
	JOIN "anime_external_id_link" link ON link."anime_id" = poster."anime_id"
	JOIN "anime_external_id" source_id
		ON source_id."id" = link."external_id_id"
		AND source_id."provider" = 'anilist'
		AND source_id."media_type" = 'anime'
	WHERE source_id."external_id" = details."anilist_id"
	LIMIT 1
) posters ON true
WHERE coalesce(
	cards."data"->>'image',
	posters."image_url",
	details."data"->>'bannerImage'
) IS NOT NULL
ON CONFLICT ("anilist_id") DO UPDATE SET
	"search_text" = excluded."search_text",
	"data" = excluded."data",
	"updated_at" = now();
--> statement-breakpoint
ANALYZE "anime_search_index";
