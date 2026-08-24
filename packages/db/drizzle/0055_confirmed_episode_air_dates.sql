UPDATE "anime_episode" AS episode
SET "air_date" = to_char(
	("target"."airing_at" AT TIME ZONE 'UTC')::date,
	'MM/DD/YYYY'
)
FROM "anime_episode_target" AS target
WHERE episode."anilist_id" = target."anilist_id"
	AND episode."number" = target."target_episode"
	AND target."state" = 'confirmed'
	AND target."confirmed_at" IS NOT NULL
	AND (
		nullif(trim(episode."air_date"), '') IS NULL
		OR (
			episode."air_date" ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
			AND to_date(episode."air_date", 'MM/DD/YYYY')
				> (target."airing_at" AT TIME ZONE 'UTC')::date
		)
	);
