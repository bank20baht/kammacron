CREATE TABLE "run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"command" text,
	"status" text DEFAULT 'running' NOT NULL,
	"exit_code" integer,
	"output" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "playbook" jsonb DEFAULT '[{"kind":"claude","name":"Claude"}]'::jsonb NOT NULL;--> statement-breakpoint
-- setup_command and verify_command become steps around the Claude step
UPDATE "projects" SET "playbook" =
  (CASE WHEN coalesce("setup_command", '') <> '' THEN jsonb_build_array(jsonb_build_object('kind', 'run', 'name', 'Setup', 'command', "setup_command")) ELSE '[]'::jsonb END)
  || '[{"kind":"claude","name":"Claude"}]'::jsonb
  || (CASE WHEN coalesce("verify_command", '') <> '' THEN jsonb_build_array(jsonb_build_object('kind', 'run', 'name', 'Verify', 'command', "verify_command", 'timeout_minutes', "verify_timeout_minutes")) ELSE '[]'::jsonb END);--> statement-breakpoint
UPDATE "runs" SET "status" = 'failed' WHERE "status" IN ('reverted', 'verifying');--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_steps_run" ON "run_steps" USING btree ("run_id","position");--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "branch";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "default_branch";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "ship_policy";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "use_worktree";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "worktree_path";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "lock_files";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "setup_hash";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "verify_timeout_minutes";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "max_diff_lines";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "protected_paths";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "copy_files";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "setup_command";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "verify_command";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "commits";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "pushed_to";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "base_sha";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "head_sha";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "verify_output";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "revert_commit";