CREATE TABLE "log_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"path" text NOT NULL,
	"content_type" text NOT NULL,
	"original_name" text,
	"kind" text DEFAULT 'scan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "log_attachments" ADD CONSTRAINT "log_attachments_log_id_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."logs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "log_attachments_log_idx" ON "log_attachments" USING btree ("log_id");