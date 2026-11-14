CREATE TABLE "daily_activity" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"submissions" integer DEFAULT 0 NOT NULL,
	"passed_submits" integer DEFAULT 0 NOT NULL,
	"new_solves" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activity_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self_check" CHECK ("follows"."follower_id" <> "follows"."followee_id")
);
--> statement-breakpoint
CREATE TABLE "paper_completions" (
	"user_id" text NOT NULL,
	"paper_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_completions_user_id_paper_id_pk" PRIMARY KEY("user_id","paper_id")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"paper_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"difficulty" text NOT NULL,
	"first_submission_id" uuid,
	"solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_user_id_paper_id_problem_id_pk" PRIMARY KEY("user_id","paper_id","problem_id"),
	CONSTRAINT "progress_difficulty_check" CHECK ("progress"."difficulty" in ('easy', 'medium', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"problems_solved" integer DEFAULT 0 NOT NULL,
	"easy_solved" integer DEFAULT 0 NOT NULL,
	"medium_solved" integer DEFAULT 0 NOT NULL,
	"hard_solved" integer DEFAULT 0 NOT NULL,
	"papers_completed" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_day" date,
	"last_solved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_completions" ADD CONSTRAINT "paper_completions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_first_submission_id_submissions_id_fk" FOREIGN KEY ("first_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_by_followee" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "user_stats_by_solved" ON "user_stats" USING btree ("problems_solved" DESC NULLS LAST,"last_solved_at","user_id");--> statement-breakpoint
CREATE INDEX "user_stats_by_papers" ON "user_stats" USING btree ("papers_completed" DESC NULLS LAST,"last_solved_at","user_id");--> statement-breakpoint
CREATE INDEX "user_stats_by_recent" ON "user_stats" USING btree ("last_solved_at" DESC NULLS LAST,"user_id");