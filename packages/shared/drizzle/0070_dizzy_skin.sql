DROP INDEX "maintenance_task_due_idx";--> statement-breakpoint
ALTER TABLE "maintenance_task" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "maintenance_task_due_idx" ON "maintenance_task" USING btree ("state","priority","next_attempt_at","lease_until");