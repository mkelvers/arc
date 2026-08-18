CREATE TYPE "public"."artwork_type" AS ENUM('backdrop', 'logo');--> statement-breakpoint
CREATE TABLE "anime_artwork" (
	"external_id_id" integer NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text NOT NULL,
	"aspect_ratio" double precision NOT NULL,
	"height" integer NOT NULL,
	"language" varchar(16),
	"vote_average" double precision NOT NULL,
	"width" integer NOT NULL,
	CONSTRAINT "anime_artwork_external_id_id_type_file_path_pk" PRIMARY KEY("external_id_id","type","file_path")
);
--> statement-breakpoint
CREATE TABLE "anime_artwork_cache" (
	"external_id_id" integer PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_artwork" ADD CONSTRAINT "anime_artwork_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_artwork_cache" ADD CONSTRAINT "anime_artwork_cache_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE cascade ON UPDATE no action;