import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { customers } from "./customers.js";
import { organizations } from "./organizations.js";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id").notNull(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    role: varchar("role", { length: 120 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
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
    index("contacts_customer_id_idx").on(table.customerId),
    index("contacts_email_idx").on(table.email),
    index("contacts_phone_idx").on(table.phone),
    unique("contacts_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
    foreignKey({
      name: "contacts_customer_organization_fk",
      columns: [table.customerId, table.organizationId],
      foreignColumns: [customers.id, customers.organizationId],
    }),
  ],
);
