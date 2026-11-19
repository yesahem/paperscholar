CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topics" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"total" integer NOT NULL,
	"answers" jsonb,
	"score" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "exam_attempts_graded_once_check" CHECK (("exam_attempts"."submitted_at" is null) = ("exam_attempts"."score" is null) and ("exam_attempts"."submitted_at" is null) = ("exam_attempts"."answers" is null)),
	CONSTRAINT "exam_attempts_score_check" CHECK ("exam_attempts"."score" is null or "exam_attempts"."score" between 0 and "exam_attempts"."total")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"rating" smallint,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"paper_id" text,
	"problem_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_type_check" CHECK ("feedback"."type" in ('review', 'bug')),
	CONSTRAINT "feedback_status_check" CHECK (("feedback"."type" = 'review' and "feedback"."status" in ('pending', 'approved', 'rejected')) or ("feedback"."type" = 'bug' and "feedback"."status" in ('open', 'resolved'))),
	CONSTRAINT "feedback_rating_check" CHECK ("feedback"."rating" is null or ("feedback"."type" = 'review' and "feedback"."rating" between 1 and 5)),
	CONSTRAINT "feedback_body_check" CHECK (char_length("feedback"."body") between 1 and 2000),
	CONSTRAINT "feedback_step_check" CHECK (("feedback"."paper_id" is null) = ("feedback"."problem_id" is null) and ("feedback"."paper_id" is null or "feedback"."type" = 'bug'))
);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_attempts_user_recent" ON "exam_attempts" USING btree ("user_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_by_status" ON "feedback" USING btree ("type","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_user_recent" ON "feedback" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);