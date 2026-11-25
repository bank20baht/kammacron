ALTER TABLE "schedules" ALTER COLUMN "command" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "playbooks" jsonb DEFAULT '[{"name":"default","steps":[{"kind":"claude","name":"Claude"}]}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "playbook" text;--> statement-breakpoint
-- the one playbook a project had becomes its default
UPDATE "projects" SET "playbooks" = jsonb_build_array(jsonb_build_object('name', 'default', 'steps', "playbook"));--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "playbook";