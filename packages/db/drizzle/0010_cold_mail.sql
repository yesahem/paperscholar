CREATE TABLE "cold_mails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cv_id" uuid,
	"target_type" text NOT NULL,
	"target_name" text NOT NULL,
	"target_organisation" text NOT NULL,
	"target_role" text,
	"target_notes" text,
	"tone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject" text,
	"body" text,
	"highlights" jsonb,
	"failure" text,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "cold_mails_target_type_check" CHECK ("cold_mails"."target_type" in ('company', 'professor')),
	CONSTRAINT "cold_mails_tone_check" CHECK ("cold_mails"."tone" in ('formal', 'friendly')),
	CONSTRAINT "cold_mails_status_check" CHECK ("cold_mails"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "cold_mails_done_check" CHECK (("cold_mails"."status" = 'done') = ("cold_mails"."subject" is not null and "cold_mails"."body" is not null))
);
--> statement-breakpoint
CREATE TABLE "cv_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"pages" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "cold_mails" ADD CONSTRAINT "cold_mails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cold_mails" ADD CONSTRAINT "cold_mails_cv_id_cv_documents_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cv_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cold_mails_user_recent" ON "cold_mails" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cv_documents_user_recent" ON "cv_documents" USING btree ("user_id","created_at" DESC NULLS LAST);