ALTER TABLE "projects" ADD COLUMN "use_worktree" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- projects made before the toggle keep working the way they did: in a worktree of their own
UPDATE "projects" SET "use_worktree" = true;
