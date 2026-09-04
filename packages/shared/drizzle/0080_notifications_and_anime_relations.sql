CREATE TYPE "public"."notification_type" AS ENUM('episode_available', 'dub_available');--> statement-breakpoint
CREATE TABLE "anime_relation" (
	"source_anime_id" integer NOT NULL,
	"target_anime_id" integer NOT NULL,
	"relation_type" varchar(32) NOT NULL,
	"source" varchar(32) NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_relation_source_anime_id_target_anime_id_relation_type_pk" PRIMARY KEY("source_anime_id","target_anime_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"anime_id" integer NOT NULL,
	"type" "public"."notification_type" NOT NULL,
	"episode_id" text NOT NULL,
	"episode_number" double precision NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "anime_relation" ADD CONSTRAINT "anime_relation_source_anime_id_anime_id_fk" FOREIGN KEY ("source_anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "anime_relation" ADD CONSTRAINT "anime_relation_target_anime_id_anime_id_fk" FOREIGN KEY ("target_anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "anime_relation_target_idx" ON "anime_relation" USING btree ("target_anime_id","relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_user_anime_episode_type_unique" ON "notification" USING btree ("user_id","anime_id","episode_id","type");--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_unread_idx" ON "notification" USING btree ("user_id","read_at");
