CREATE TABLE "vehicle_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"path" text NOT NULL,
	"content_type" text NOT NULL,
	"original_name" text,
	"kind" text DEFAULT 'other' NOT NULL,
	"label" text,
	"extracted_text" text,
	"uploaded_by_id" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("vehicle_documents"."label", '') || ' ' || coalesce("vehicle_documents"."original_name", '') || ' ' || coalesce("vehicle_documents"."extracted_text", ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchase_price" double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchase_odometer" double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "seller" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "purchase_note" text;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_documents_vehicle_idx" ON "vehicle_documents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_documents_search_idx" ON "vehicle_documents" USING gin ("search_tsv");