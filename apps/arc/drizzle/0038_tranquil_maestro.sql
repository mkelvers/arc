CREATE TABLE "anime_synopsis_cache" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"synopsis" text,
	"source_anilist_id" integer,
	"tmdb_external_id_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_hero_candidate" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"average_score" integer NOT NULL,
	"trending_rank" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "home_hero_selection" RENAME COLUMN "week_start" TO "rotation_start";--> statement-breakpoint
DELETE FROM "home_hero_selection";--> statement-breakpoint
ALTER TABLE "home_hero_selection" DROP CONSTRAINT "home_hero_selection_week_anilist_unique";--> statement-breakpoint
ALTER TABLE "home_hero_selection" DROP CONSTRAINT "home_hero_selection_week_start_position_pk";--> statement-breakpoint
ALTER TABLE "home_hero_selection" ADD CONSTRAINT "home_hero_selection_rotation_start_position_pk" PRIMARY KEY("rotation_start","position");--> statement-breakpoint
ALTER TABLE "anime_synopsis_cache" ADD CONSTRAINT "anime_synopsis_cache_tmdb_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("tmdb_external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "home_hero_candidate_fetched_idx" ON "home_hero_candidate" USING btree ("fetched_at");--> statement-breakpoint
ALTER TABLE "home_hero_selection" ADD CONSTRAINT "home_hero_selection_rotation_anilist_unique" UNIQUE("rotation_start","anilist_id");
