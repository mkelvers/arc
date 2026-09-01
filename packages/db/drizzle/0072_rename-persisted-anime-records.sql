ALTER TABLE "anime_card_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anime_details_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "anime_card_cache" CASCADE;--> statement-breakpoint
DROP TABLE "anime_details_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "anilist_query_cache" RENAME TO "anilist_query_snapshot";--> statement-breakpoint
ALTER TABLE "anime_artwork_cache" RENAME TO "anime_artwork_sync";--> statement-breakpoint
ALTER TABLE "anime_franchise_cache" RENAME TO "anime_franchise";--> statement-breakpoint
ALTER TABLE "anime_simulcast_page_cache" RENAME TO "anime_simulcast_page";--> statement-breakpoint
ALTER TABLE "anime_synopsis_cache" RENAME TO "anime_synopsis";--> statement-breakpoint
ALTER TABLE "anilist_query_snapshot" RENAME COLUMN "expires_at" TO "refresh_after";--> statement-breakpoint
ALTER TABLE "anime_artwork_sync" DROP CONSTRAINT "anime_artwork_cache_external_id_id_anime_external_id_id_fk";
--> statement-breakpoint
ALTER TABLE "anime_synopsis" DROP CONSTRAINT "anime_synopsis_cache_tmdb_external_id_id_anime_external_id_id_fk";
--> statement-breakpoint
DROP INDEX "anilist_query_cache_expires_idx";--> statement-breakpoint
ALTER TABLE "anime_simulcast_page" DROP CONSTRAINT "anime_simulcast_page_cache_provider_season_year_page_pk";--> statement-breakpoint
ALTER TABLE "anime_simulcast_page" ADD CONSTRAINT "anime_simulcast_page_provider_season_year_page_pk" PRIMARY KEY("provider","season","year","page");--> statement-breakpoint
ALTER TABLE "anime_artwork_sync" ADD CONSTRAINT "anime_artwork_sync_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_synopsis" ADD CONSTRAINT "anime_synopsis_tmdb_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("tmdb_external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anilist_query_snapshot_refresh_after_idx" ON "anilist_query_snapshot" USING btree ("refresh_after");