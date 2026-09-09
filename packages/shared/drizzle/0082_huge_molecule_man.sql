CREATE TABLE "provider_snapshot" (
	"provider" varchar(32) NOT NULL,
	"domain" varchar(32) NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" text NOT NULL,
	"variant" varchar(64) DEFAULT '' NOT NULL,
	"canonical_anime_id" integer,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_snapshot_provider_domain_subject_type_subject_id_variant_pk" PRIMARY KEY("provider","domain","subject_type","subject_id","variant")
);
--> statement-breakpoint
ALTER TABLE "provider_snapshot" ADD CONSTRAINT "provider_snapshot_canonical_anime_id_anime_id_fk" FOREIGN KEY ("canonical_anime_id") REFERENCES "public"."anime"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "provider_snapshot_anime_domain_idx" ON "provider_snapshot" USING btree ("canonical_anime_id","domain","provider");
--> statement-breakpoint
CREATE INDEX "provider_snapshot_refresh_idx" ON "provider_snapshot" USING btree ("provider","domain","updated_at");
