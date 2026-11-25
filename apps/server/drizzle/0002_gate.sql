ALTER TABLE "projects" ADD COLUMN "max_diff_lines" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "protected_paths" text[] DEFAULT '{}' NOT NULL;