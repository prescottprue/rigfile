import { createId } from "@paralleldrive/cuid2";
import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const cuid2 = () => text().$defaultFn(() => createId());

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const users = pgTable(
  "users",
  {
    id: cuid2().primaryKey(),
    email: text().notNull(),
    displayName: text("display_name"),
    avatarPath: text("avatar_path"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const passwords = pgTable("passwords", {
  hash: text().notNull(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
});

export const mechanics = pgTable(
  "mechanics",
  {
    id: cuid2().primaryKey(),
    name: text().notNull(),
    email: text(),
    location: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("mechanics_email_idx").on(t.email)],
);

export const vehicles = pgTable("vehicles", {
  id: cuid2().primaryKey(),
  name: text(),
  make: text().notNull(),
  model: text().notNull(),
  trim: text(),
  year: integer().notNull(),
  avatarPath: text("avatar_path"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  ...timestamps,
});

export const logs = pgTable(
  "logs",
  {
    id: cuid2().primaryKey(),
    title: text().notNull(),
    notes: text(),
    // Free-form service type: one of "Minor", "Major", "Modify", "Check" in UI.
    type: text(),
    cost: doublePrecision(),
    odometer: doublePrecision(),
    servicedAt: timestamp("serviced_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    selfService: boolean("self_service").notNull().default(false),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    mechanicId: text("mechanic_id").references(() => mechanics.id, {
      onDelete: "set null",
    }),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${logs.title}, '') || ' ' || coalesce(${logs.notes}, ''))`,
    ),
    ...timestamps,
  },
  (t) => [
    index("logs_search_idx").using("gin", t.searchTsv),
    index("logs_vehicle_idx").on(t.vehicleId),
    index("logs_user_idx").on(t.userId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const parts = pgTable("parts", {
  id: serial().primaryKey(),
  name: text().notNull(),
  manufacturer: text().notNull(),
  price: doublePrecision().notNull(),
  link: text(),
  note: text(),
});

export const logsToTags = pgTable(
  "logs_to_tags",
  {
    logId: text("log_id")
      .notNull()
      .references(() => logs.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.logId, t.tagId] })],
);

export const logsToParts = pgTable(
  "logs_to_parts",
  {
    logId: text("log_id")
      .notNull()
      .references(() => logs.id, { onDelete: "cascade" }),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.logId, t.partId] })],
);

export const logFiles = pgTable(
  "log_files",
  {
    id: cuid2().primaryKey(),
    logId: text("log_id")
      .notNull()
      .references(() => logs.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileSize: integer("file_size").notNull(),
    category: text().notNull(),
    description: text(),
    ...timestamps,
  },
  (t) => [
    index("log_files_log_idx").on(t.logId),
    index("log_files_user_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
export type Mechanic = typeof mechanics.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Part = typeof parts.$inferSelect;
export type LogFile = typeof logFiles.$inferSelect;
export type NewLogFile = typeof logFiles.$inferInsert;
