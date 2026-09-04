DELETE FROM "anime_provider_mapping"
WHERE "provider" = 'allanime';--> statement-breakpoint
DELETE FROM "anime_mapping_override"
WHERE "provider" = 'allanime';--> statement-breakpoint
DROP TABLE IF EXISTS "anime_playback_provider";--> statement-breakpoint
DROP TABLE IF EXISTS "anime_simulcast_page_cache";
