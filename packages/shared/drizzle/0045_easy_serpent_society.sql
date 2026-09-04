ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp with time zone;
