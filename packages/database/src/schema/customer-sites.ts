import {
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { contacts } from "./contacts.js";
import { customers } from "./customers.js";
import { organizations } from "./organizations.js";

export const customerSites = pgTable(
  "customer_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    addressLine1: varchar("address_line1", { length: 255 }).notNull(),
    addressLine2: varchar("address_line2", { length: 255 }),
    postalCode: varchar("postal_code", { length: 20 }).notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("FR"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    accessInstructions: text("access_instructions"),
    accessHours: text("access_hours"),
    primaryContactId: uuid("primary_contact_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("customer_sites_customer_id_idx").on(table.customerId),
    index("customer_sites_postal_code_idx").on(table.postalCode),
    index("customer_sites_city_idx").on(table.city),
    foreignKey({
      name: "customer_sites_customer_organization_fk",
      columns: [table.customerId, table.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
    foreignKey({
      name: "customer_sites_primary_contact_organization_fk",
      columns: [table.primaryContactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }),
  ],
);
