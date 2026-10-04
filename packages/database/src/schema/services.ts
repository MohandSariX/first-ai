import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { pricingModeEnum } from "./enums.js";
import { organizations } from "./organizations.js";

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 120 }),
    description: text("description"),
    pricingMode: pricingModeEnum("pricing_mode").notNull(),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("services_organization_id_idx").on(table.organizationId),
    index("services_category_idx").on(table.category),
    index("services_active_idx").on(table.active),
    unique("services_organization_id_code_unique").on(table.organizationId, table.code),
  ],
);
