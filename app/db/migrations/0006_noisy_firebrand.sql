CREATE TABLE "odometer_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"odometer" double precision NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"user_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engine" text;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "odometer_readings_vehicle_idx" ON "odometer_readings" USING btree ("vehicle_id");
