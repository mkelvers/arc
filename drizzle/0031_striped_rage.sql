DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_kind') THEN
    CREATE TYPE "public"."notification_kind" AS ENUM('episode_available', 'dub_available', 'season_available');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.notification_kind'::regtype
      AND enumlabel = 'season_available'
  ) THEN
    ALTER TYPE "public"."notification_kind" ADD VALUE 'season_available';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode_id" text,
	"dedupe_key" text NOT NULL,
	"facts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_user_dedupe_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at");
