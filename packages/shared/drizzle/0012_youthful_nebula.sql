CREATE TABLE "anime_provider_mapping" (
	"anilist_id" integer NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_media_id" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_provider_mapping_anilist_id_provider_pk" PRIMARY KEY("anilist_id","provider")
);
--> statement-breakpoint
INSERT INTO "anime_provider_mapping" (
	"anilist_id",
	"provider",
	"provider_media_id",
	"discovered_at",
	"verified_at"
)
SELECT
	"anilist_id",
	'allanime',
	"allanime_show_id",
	"discovered_at",
	"verified_at"
FROM "anime_playback_provider"
ON CONFLICT ("anilist_id", "provider") DO NOTHING;
