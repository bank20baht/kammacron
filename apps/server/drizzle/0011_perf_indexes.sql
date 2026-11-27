CREATE INDEX "alerts_card" ON "alerts" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "alerts_run" ON "alerts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "attachments_sha256" ON "attachments" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "cards_claimed_by_run" ON "cards" USING btree ("claimed_by_run");--> statement-breakpoint
CREATE INDEX "run_events_created_at" ON "run_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_status" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_started_at" ON "runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "runs_schedule" ON "runs" USING btree ("schedule_id");