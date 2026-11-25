CREATE TABLE "course_notes" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"item_id" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_notes_user_id_course_id_item_id_pk" PRIMARY KEY("user_id","course_id","item_id"),
	CONSTRAINT "course_notes_body_check" CHECK (char_length("course_notes"."body") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"item_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"last_watched_seconds" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_progress_user_id_course_id_item_id_pk" PRIMARY KEY("user_id","course_id","item_id"),
	CONSTRAINT "course_progress_watched_check" CHECK ("course_progress"."last_watched_seconds" >= 0),
	CONSTRAINT "course_progress_completed_check" CHECK ("course_progress"."completed" = ("course_progress"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;