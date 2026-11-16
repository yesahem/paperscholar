CREATE TABLE "ingestion_steps" (
	"ingestion_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verification" jsonb,
	"waivers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_steps_ingestion_id_step_id_pk" PRIMARY KEY("ingestion_id","step_id"),
	CONSTRAINT "ingestion_steps_status_check" CHECK ("ingestion_steps"."status" in ('pending', 'writing', 'verifying', 'verified', 'needs_attention', 'edited'))
);
--> statement-breakpoint
CREATE TABLE "ingestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text,
	"pdf_sha256" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"title" text,
	"paper_id" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"llm_file_id" text,
	"failed_stage" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ingestions_status_check" CHECK ("ingestions"."status" in ('queued', 'reading', 'planning', 'awaiting_plan_review', 'writing', 'ready_for_review', 'published', 'failed', 'cancelled')),
	CONSTRAINT "ingestions_source_type_check" CHECK ("ingestions"."source_type" in ('pdf', 'arxiv'))
);
--> statement-breakpoint
CREATE TABLE "pipeline_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ingestion_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_tasks_kind_check" CHECK ("pipeline_tasks"."kind" in ('read', 'plan', 'write', 'verify', 'assemble')),
	CONSTRAINT "pipeline_tasks_status_check" CHECK ("pipeline_tasks"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ingestion_steps" ADD CONSTRAINT "ingestion_steps_ingestion_id_ingestions_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestions" ADD CONSTRAINT "ingestions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_tasks" ADD CONSTRAINT "pipeline_tasks_ingestion_id_ingestions_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestions_one_per_pdf" ON "ingestions" USING btree ("pdf_sha256") WHERE "ingestions"."status" not in ('failed', 'cancelled', 'published');--> statement-breakpoint
CREATE INDEX "ingestions_by_source_ref" ON "ingestions" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "ingestions_by_creator" ON "ingestions" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_tasks_runnable" ON "pipeline_tasks" USING btree ("run_after") WHERE "pipeline_tasks"."status" in ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_tasks_one_open" ON "pipeline_tasks" USING btree ("ingestion_id","kind","key") WHERE "pipeline_tasks"."status" in ('pending', 'running');