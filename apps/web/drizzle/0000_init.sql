CREATE TYPE "public"."difficulty" AS ENUM('junior', 'mid', 'senior');--> statement-breakpoint
CREATE TYPE "public"."framework" AS ENUM('react', 'vue', 'angular');--> statement-breakpoint
CREATE TYPE "public"."proficiency" AS ENUM('proficient', 'developing', 'skill_gap');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"framework" "framework" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"skill_category" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"code_block" text,
	"options" jsonb NOT NULL,
	"correct_answer" integer NOT NULL,
	"explanation" text NOT NULL,
	"difficulty_weight" real DEFAULT 1 NOT NULL,
	"source" varchar(100) DEFAULT 'original' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" varchar(50) NOT NULL,
	"selected_answer" integer NOT NULL,
	"time_spent_seconds" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_category_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"skill_category" varchar(50) NOT NULL,
	"correct_weight" real NOT NULL,
	"total_weight" real NOT NULL,
	"score_pct" real NOT NULL,
	"proficiency" "proficiency" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"target_level" "difficulty" NOT NULL,
	"total_score" real NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"proficiency_level" "proficiency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_results_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "skill_categories" (
	"name" varchar(50) PRIMARY KEY NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text,
	"pillar_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" varchar(64) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"framework" "framework" NOT NULL,
	"target_level" "difficulty" NOT NULL,
	"status" "session_status" DEFAULT 'in_progress' NOT NULL,
	"selected_question_ids" jsonb NOT NULL,
	"focus_loss_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_skill_category_skill_categories_name_fk" FOREIGN KEY ("skill_category") REFERENCES "public"."skill_categories"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_answers" ADD CONSTRAINT "session_answers_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_answers" ADD CONSTRAINT "session_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_category_scores" ADD CONSTRAINT "session_category_scores_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_category_scores" ADD CONSTRAINT "session_category_scores_skill_category_skill_categories_name_fk" FOREIGN KEY ("skill_category") REFERENCES "public"."skill_categories"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_results" ADD CONSTRAINT "session_results_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_questions_framework_difficulty" ON "questions" USING btree ("framework","difficulty");--> statement-breakpoint
CREATE INDEX "idx_questions_category" ON "questions" USING btree ("skill_category");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_answer_session_question" ON "session_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_session_answers_session" ON "session_answers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_category_session" ON "session_category_scores" USING btree ("session_id","skill_category");--> statement-breakpoint
CREATE INDEX "idx_category_scores_session" ON "session_category_scores" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_status" ON "test_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sessions_client_recent" ON "test_sessions" USING btree ("client_id","created_at");