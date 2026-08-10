CREATE TABLE "anilist_query_cache" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anilist_query_cache_expires_idx" ON "anilist_query_cache" USING btree ("expires_at");