import {
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  siret: varchar("siret", { length: 14 }),
  vatNumber: varchar("vat_number", { length: 32 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  postalCode: varchar("postal_code", { length: 20 }),
  city: varchar("city", { length: 120 }),
  country: varchar("country", { length: 2 }).notNull().default("FR"),
  timezone: varchar("timezone", { length: 64 })
    .notNull()
    .default("Europe/Paris"),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
