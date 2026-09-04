CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"reservation_id" uuid,
	"used_at" timestamp with time zone,
	"used_by_user_id" uuid,
	CONSTRAINT "invitations_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_reservation_id_unique" ON "invitations" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "invitations_used_by_user_id_idx" ON "invitations" USING btree ("used_by_user_id");