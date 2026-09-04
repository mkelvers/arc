CREATE TABLE "home_hero_selection" (
	"week_start" varchar(10) NOT NULL,
	"position" integer NOT NULL,
	"anilist_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_hero_selection_week_start_position_pk" PRIMARY KEY("week_start","position"),
	CONSTRAINT "home_hero_selection_week_anilist_unique" UNIQUE("week_start","anilist_id")
);
