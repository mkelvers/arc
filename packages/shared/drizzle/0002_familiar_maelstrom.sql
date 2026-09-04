CREATE TABLE "anime_artwork_selection" (
	"anime_id" integer NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_artwork_selection_anime_id_type_pk" PRIMARY KEY("anime_id","type")
);
--> statement-breakpoint
ALTER TABLE "anime_artwork_selection" ADD CONSTRAINT "anime_artwork_selection_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;