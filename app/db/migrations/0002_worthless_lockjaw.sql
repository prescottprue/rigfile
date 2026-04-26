CREATE TABLE "log_files" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"user_id" text NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "log_files" ADD CONSTRAINT "log_files_log_id_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."logs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "log_files" ADD CONSTRAINT "log_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "log_files_log_idx" ON "log_files" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "log_files_user_idx" ON "log_files" USING btree ("user_id");