CREATE TABLE "oauth_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "public_url" text;--> statement-breakpoint
CREATE INDEX "oauth_kv_expires" ON "oauth_kv" USING btree ("expires_at");