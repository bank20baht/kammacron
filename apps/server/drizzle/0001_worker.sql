CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"project_id" integer,
	"card_id" integer,
	"run_id" integer,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"command" text NOT NULL,
	"interval_minutes" integer DEFAULT 1440 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_exit_code" integer,
	"last_card_id" integer,
	"card_tags" text[] DEFAULT '{"claude"}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "mode" text DEFAULT 'autopilot' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ship_policy" text DEFAULT 'push' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "worktree_path" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lock_files" text[] DEFAULT '{"bun.lock","bun.lockb","package-lock.json","pnpm-lock.yaml","yarn.lock"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "setup_hash" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verify_timeout_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "base_sha" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "permission_denials" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "error_kind" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "verify_output" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "worker_path" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "concurrency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "desktop_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_last_card_id_cards_id_fk" FOREIGN KEY ("last_card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;