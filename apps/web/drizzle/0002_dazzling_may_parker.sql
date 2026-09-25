DROP INDEX "idx_sessions_status";--> statement-breakpoint
ALTER TABLE "session_results" ADD COLUMN "report_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD COLUMN "question_snapshot" jsonb;--> statement-breakpoint
CREATE INDEX "idx_sessions_created_id" ON "test_sessions" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "idx_sessions_status_activity_id" ON "test_sessions" USING btree ("status","last_activity_at","id");