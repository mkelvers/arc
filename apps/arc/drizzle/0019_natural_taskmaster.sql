CREATE TABLE "anime_release_poster" (
	"anime_id" integer PRIMARY KEY NOT NULL,
	"external_id_id" integer NOT NULL,
	"file_path" text,
	"season_number" integer,
	"aspect_ratio" double precision,
	"height" integer,
	"language" varchar(16),
	"vote_average" double precision,
	"width" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_release_poster" ADD CONSTRAINT "anime_release_poster_anime_id_external_id_id_anime_external_id_link_anime_id_external_id_id_fk" FOREIGN KEY ("anime_id","external_id_id") REFERENCES "public"."anime_external_id_link"("anime_id","external_id_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_release_poster_external_id_idx" ON "anime_release_poster" USING btree ("external_id_id");