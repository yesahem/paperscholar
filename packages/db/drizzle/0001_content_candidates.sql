CREATE TABLE "content_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paper_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_candidates_status_check" CHECK ("content_candidates"."status" in ('pending', 'verifying', 'passed', 'failed', 'applied'))
);
--> statement-breakpoint
CREATE INDEX "content_candidates_paper_idx" ON "content_candidates" USING btree ("paper_id","created_at");