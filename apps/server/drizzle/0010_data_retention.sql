ALTER TABLE "settings" ALTER COLUMN "run_log_retention_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "step_output_retention_days" integer DEFAULT 90;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "run_retention_days" integer DEFAULT 365;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "done_card_archive_days" integer DEFAULT 14;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "archived_card_retention_days" integer DEFAULT 180;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "alert_retention_days" integer DEFAULT 30;--> statement-breakpoint
-- the clocks of cards already done or archived start now: an upgrade archives and removes nothing at once
UPDATE "cards" SET "done_at" = now() WHERE "status" = 'done';--> statement-breakpoint
UPDATE "cards" SET "archived_at" = now() WHERE "archived" = true;
