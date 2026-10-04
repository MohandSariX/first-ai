import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { leadSourceEnum, leadStatusEnum } from "./enums.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    source: leadSourceEnum("source").notNull().default("manual"),
    type: varchar("type", { length: 80 }),
    companyName: varchar("company_name", { length: 255 }),
    firstName: varchar("first_name", { length: 120 }),
    lastName: varchar("last_name", { length: 120 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    addressLine1: varchar("address_line1", { length: 255 }),
    addressLine2: varchar("address_line2", { length: 255 }),
    postalCode: varchar("postal_code", { length: 20 }),
    city: varchar("city", { length: 120 }),
    country: varchar("country", { length: 2 }).notNull().default("FR"),
    status: leadStatusEnum("status").notNull().default("new"),
    score: integer("score").notNull().default(0),
    assignedUserId: uuid("assigned_user_id"),
    estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("leads_organization_id_idx").on(table.organizationId),
    index("leads_organization_status_created_at_idx").on(table.organizationId, table.status, table.createdAt),
    index("leads_score_idx").on(table.score),
    index("leads_assigned_user_id_idx").on(table.assignedUserId),
    index("leads_email_idx").on(table.email),
    index("leads_phone_idx").on(table.phone),
    check("leads_score_range_check", sql`${table.score} between 0 and 100`),
    foreignKey({
      name: "leads_assigned_user_organization_fk",
      columns: [table.assignedUserId, table.organizationId],
      foreignColumns: [users.id, users.organizationId],
    }),
  ],
);
