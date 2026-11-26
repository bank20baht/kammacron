ALTER TABLE "runs" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "card_tags" SET DEFAULT '{"auto-pilot"}';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "schedule_id" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "agent" text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "agent" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "use_board" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "cron" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "last_result" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "last_run_id" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- the tag that hands a card to agents is `auto-pilot` now, no longer `claude`
UPDATE "cards" SET "tags" = array_replace("tags", 'claude', 'auto-pilot') WHERE 'claude' = ANY("tags");--> statement-breakpoint
UPDATE "schedules" SET "card_tags" = array_replace("card_tags", 'claude', 'auto-pilot') WHERE 'claude' = ANY("card_tags");
