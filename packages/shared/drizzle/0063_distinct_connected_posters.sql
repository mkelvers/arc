WITH connected_posters AS (
    SELECT
        poster."anime_id",
        poster."file_path",
        ROW_NUMBER() OVER (
            PARTITION BY source."anilist_id", source."source_anilist_id", poster."file_path"
            ORDER BY anilist."external_id"
        ) AS "position"
    FROM "anime_release_poster" poster
    JOIN "anime_external_id_link" tmdb_link
        ON tmdb_link."anime_id" = poster."anime_id"
       AND tmdb_link."external_id_id" = poster."external_id_id"
    JOIN "anime_external_id_link" anilist_link
        ON anilist_link."anime_id" = poster."anime_id"
    JOIN "anime_external_id" anilist
        ON anilist."id" = anilist_link."external_id_id"
       AND anilist."provider" = 'anilist'
       AND anilist."media_type" = 'anime'
    JOIN "anime_artwork_source" source
        ON source."anilist_id" = anilist."external_id"
        OR source."source_anilist_id" = anilist."external_id"
    WHERE poster."file_path" IS NOT NULL
)
UPDATE "anime_release_poster" poster
SET "file_path" = NULL,
    "season_number" = NULL,
    "aspect_ratio" = NULL,
    "height" = NULL,
    "language" = NULL,
    "vote_average" = NULL,
    "width" = NULL,
    "fetched_at" = NOW()
FROM connected_posters duplicate
WHERE duplicate."position" > 1
  AND duplicate."anime_id" = poster."anime_id"
  AND duplicate."file_path" = poster."file_path";
