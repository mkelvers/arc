WITH "movie_releases" AS (
	SELECT DISTINCT "anilist_id"."external_id" AS "anilist_id"
	FROM "anime_external_id" AS "anilist_id"
	INNER JOIN "anime_external_id_link" AS "anilist_link"
		ON "anilist_link"."external_id_id" = "anilist_id"."id"
	INNER JOIN "anime_external_id_link" AS "tmdb_link"
		ON "tmdb_link"."anime_id" = "anilist_link"."anime_id"
	INNER JOIN "anime_external_id" AS "tmdb_id"
		ON "tmdb_id"."id" = "tmdb_link"."external_id_id"
	WHERE "anilist_id"."provider" = 'anilist'
		AND "anilist_id"."media_type" = 'anime'
		AND "tmdb_id"."provider" = 'tmdb'
		AND "tmdb_id"."media_type" = 'movie'
),
"preference_owners" AS (
	SELECT
		"movie_releases"."anilist_id",
		COALESCE("anime_artwork_source"."anilist_id", "movie_releases"."anilist_id") AS "owner_anilist_id"
	FROM "movie_releases"
	LEFT JOIN "anime_artwork_source"
		ON "anime_artwork_source"."anilist_id" = "movie_releases"."anilist_id"
		OR "anime_artwork_source"."source_anilist_id" = "movie_releases"."anilist_id"
),
"selected_backdrops" AS (
	SELECT
		"preference_owners"."anilist_id",
		"anime_artwork_preference"."backdrop_file_path"
	FROM "preference_owners"
	INNER JOIN "anime_external_id" AS "owner_anilist_id"
		ON "owner_anilist_id"."provider" = 'anilist'
		AND "owner_anilist_id"."media_type" = 'anime'
		AND "owner_anilist_id"."external_id" = "preference_owners"."owner_anilist_id"
	INNER JOIN "anime_external_id_link" AS "owner_anilist_link"
		ON "owner_anilist_link"."external_id_id" = "owner_anilist_id"."id"
	INNER JOIN "anime_external_id_link" AS "owner_tmdb_link"
		ON "owner_tmdb_link"."anime_id" = "owner_anilist_link"."anime_id"
	INNER JOIN "anime_external_id" AS "owner_tmdb_id"
		ON "owner_tmdb_id"."id" = "owner_tmdb_link"."external_id_id"
		AND "owner_tmdb_id"."provider" = 'tmdb'
		AND "owner_tmdb_id"."media_type" IN ('movie', 'tv')
	INNER JOIN "anime_artwork_preference"
		ON "anime_artwork_preference"."external_id_id" = "owner_tmdb_id"."id"
	WHERE "anime_artwork_preference"."backdrop_file_path" IS NOT NULL
)
UPDATE "anime_episode"
SET "image_url" = 'https://image.tmdb.org/t/p/original' || "selected_backdrops"."backdrop_file_path"
FROM "selected_backdrops"
WHERE "anime_episode"."anilist_id" = "selected_backdrops"."anilist_id"
	AND "anime_episode"."image_url" IS DISTINCT FROM
		'https://image.tmdb.org/t/p/original' || "selected_backdrops"."backdrop_file_path";
