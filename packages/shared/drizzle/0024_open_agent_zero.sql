ALTER TABLE "anime_catalog" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_catalog_taxonomy" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "anime_catalog_tags_idx" ON "anime_catalog" USING gin ("tags");