CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"type" text,
	"cost" double precision,
	"odometer" double precision,
	"serviced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"self_service" boolean DEFAULT false NOT NULL,
	"user_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"mechanic_id" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("logs"."title", '') || ' ' || coalesce("logs"."notes", ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs_to_parts" (
	"log_id" text NOT NULL,
	"part_id" integer NOT NULL,
	CONSTRAINT "logs_to_parts_log_id_part_id_pk" PRIMARY KEY("log_id","part_id")
);
--> statement-breakpoint
CREATE TABLE "logs_to_tags" (
	"log_id" text NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "logs_to_tags_log_id_tag_id_pk" PRIMARY KEY("log_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "mechanics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text NOT NULL,
	"price" double precision NOT NULL,
	"link" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "passwords" (
	"hash" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "passwords_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"year" integer NOT NULL,
	"avatar_path" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_mechanic_id_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs_to_parts" ADD CONSTRAINT "logs_to_parts_log_id_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs_to_parts" ADD CONSTRAINT "logs_to_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs_to_tags" ADD CONSTRAINT "logs_to_tags_log_id_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs_to_tags" ADD CONSTRAINT "logs_to_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwords" ADD CONSTRAINT "passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "logs_search_idx" ON "logs" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "logs_vehicle_idx" ON "logs" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "logs_user_idx" ON "logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mechanics_email_idx" ON "mechanics" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_idx" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");