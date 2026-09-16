CREATE TABLE "session_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"helpfulness_rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_surveys_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "session_surveys" ADD CONSTRAINT "session_surveys_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;