ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
