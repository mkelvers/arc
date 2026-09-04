ALTER TABLE "anime_catalog" ADD COLUMN "source" varchar(32);--> statement-breakpoint
ALTER TABLE "anime_catalog" ADD COLUMN "season" varchar(16);--> statement-breakpoint
ALTER TABLE "anime_catalog" ADD COLUMN "season_year" integer;--> statement-breakpoint
ALTER TABLE "anime_catalog" ADD COLUMN "country_of_origin" varchar(8);--> statement-breakpoint
ALTER TABLE "anime_catalog_taxonomy" ADD COLUMN "sources" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_catalog_taxonomy" ADD COLUMN "seasons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "anime_catalog_season_year_idx" ON "anime_catalog" USING btree ("season","season_year");--> statement-breakpoint
CREATE INDEX "anime_catalog_source_country_idx" ON "anime_catalog" USING btree ("source","country_of_origin");
--> statement-breakpoint
DELETE FROM "anime_catalog_refresh";
