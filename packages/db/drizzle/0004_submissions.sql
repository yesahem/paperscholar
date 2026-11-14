CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"paper_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"mode" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"verdict" text,
	"tests_passed" integer,
	"tests_total" integer,
	"result" jsonb,
	"duration_ms" integer,
	"content_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "submissions_mode_check" CHECK ("submissions"."mode" in ('run', 'submit')),
	CONSTRAINT "submissions_status_check" CHECK ("submissions"."status" in ('queued', 'running', 'completed', 'error')),
	CONSTRAINT "submissions_verdict_check" CHECK ("submissions"."verdict" is null or "submissions"."verdict" in ('passed', 'failed', 'time_limit_exceeded', 'memory_limit_exceeded', 'import_violation', 'runtime_error', 'internal_error'))
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_user_recent" ON "submissions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_user_problem" ON "submissions" USING btree ("user_id","paper_id","problem_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_one_in_flight" ON "submissions" USING btree ("user_id") WHERE "submissions"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "submissions_in_flight_age" ON "submissions" USING btree ("created_at") WHERE "submissions"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "submissions_run_mode_age" ON "submissions" USING btree ("created_at") WHERE "submissions"."mode" = 'run';