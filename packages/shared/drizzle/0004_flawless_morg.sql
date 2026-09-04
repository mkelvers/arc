CREATE TABLE "anime_artwork_preference" (
	"external_id_id" integer PRIMARY KEY NOT NULL,
	"backdrop_file_path" text,
	"logo_file_path" text,
	"logo_hidden" boolean DEFAULT false NOT NULL,
	"logo_size" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "anime_artwork_preference" (
	"external_id_id",
	"backdrop_file_path",
	"logo_file_path",
	"logo_hidden",
	"logo_size",
	"updated_at"
)
SELECT
	tmdb."id",
	backdrop."file_path",
	logo."file_path",
	logo."updated_at" IS NOT NULL AND logo."file_path" IS NULL,
	COALESCE(settings."logo_size", 100),
	COALESCE(GREATEST(backdrop."updated_at", logo."updated_at", settings."updated_at"), now())
FROM "anime_external_id" tmdb
LEFT JOIN LATERAL (
	SELECT selection."file_path", selection."updated_at"
	FROM "anime_artwork_selection" selection
	INNER JOIN "anime_external_id_link" link ON link."anime_id" = selection."anime_id"
	WHERE link."external_id_id" = tmdb."id" AND selection."type" = 'backdrop'
	ORDER BY selection."updated_at" DESC
	LIMIT 1
) backdrop ON true
LEFT JOIN LATERAL (
	SELECT selection."file_path", selection."updated_at"
	FROM "anime_artwork_selection" selection
	INNER JOIN "anime_external_id_link" link ON link."anime_id" = selection."anime_id"
	WHERE link."external_id_id" = tmdb."id" AND selection."type" = 'logo'
	ORDER BY selection."updated_at" DESC
	LIMIT 1
) logo ON true
LEFT JOIN LATERAL (
	SELECT anime."logo_size", anime."updated_at"
	FROM "anime"
	INNER JOIN "anime_external_id_link" link ON link."anime_id" = anime."id"
	WHERE link."external_id_id" = tmdb."id"
	ORDER BY anime."updated_at" DESC
	LIMIT 1
) settings ON true
WHERE tmdb."provider" = 'tmdb';
--> statement-breakpoint
DROP TABLE "anime_artwork_selection" CASCADE;--> statement-breakpoint
ALTER TABLE "anime_artwork_preference" ADD CONSTRAINT "anime_artwork_preference_external_id_id_anime_external_id_id_fk" FOREIGN KEY ("external_id_id") REFERENCES "public"."anime_external_id"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "logo_size";
