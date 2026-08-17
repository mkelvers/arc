CREATE TYPE "public"."episode_segment_kind" AS ENUM('opening', 'ending');--> statement-breakpoint
CREATE TABLE "anime_episode_segment_template" (
	"anilist_id" integer NOT NULL,
	"kind" "episode_segment_kind" NOT NULL,
	"episode_from" integer NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_episode_segment_template_anilist_id_kind_episode_from_pk" PRIMARY KEY("anilist_id","kind","episode_from")
);
--> statement-breakpoint
CREATE INDEX "anime_episode_segment_template_lookup_idx" ON "anime_episode_segment_template" USING btree ("anilist_id","kind","episode_from");