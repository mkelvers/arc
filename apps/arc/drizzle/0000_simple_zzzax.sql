CREATE TYPE "public"."external_media_type" AS ENUM('anime', 'movie', 'tv');--> statement-breakpoint
CREATE TYPE "public"."external_provider" AS ENUM('anilist', 'tmdb');--> statement-breakpoint
CREATE TABLE "anime" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "anime_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_external_id" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "anime_external_id_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" "external_provider" NOT NULL,
	"media_type" "external_media_type" NOT NULL,
	"external_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_external_id_identity" UNIQUE("provider","media_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "anime_external_id_link" (
	"anime_id" integer NOT NULL,
	"external_id_id" integer NOT NULL,
	CONSTRAINT "anime_external_id_link_anime_id_external_id_id_pk" PRIMARY KEY("anime_id","external_id_id")
);
--> statement-breakpoint
ALTER TABLE "anime_external_id_link" ADD CONSTRAINT "anime_external_id_link_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_external_id_link" ADD CONSTRAINT "anime_external_id_link_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE cascade ON UPDATE no action;