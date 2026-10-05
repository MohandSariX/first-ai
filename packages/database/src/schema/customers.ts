import {
  check,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  customerRiskLevelEnum,
  customerStatusEnum,
  customerTypeEnum,
} from "./enums.js";
import { organizations } from "./organizations.js";
import { billingClassificationEnum } from "./billing-enums.js";
import { sql } from "drizzle-orm";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    type: customerTypeEnum("type").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    billingClassification: billingClassificationEnum("billing_classification"),
    billingName: varchar("billing_name", { length: 255 }),
    billingLegalName: varchar("billing_legal_name", { length: 255 }),
    billingAddressLine1: varchar("billing_address_line1", { length: 255 }),
    billingAddressLine2: varchar("billing_address_line2", { length: 255 }),
    billingPostalCode: varchar("billing_postal_code", { length: 20 }),
    billingCity: varchar("billing_city", { length: 120 }),
    billingCountry: varchar("billing_country", { length: 2 }),
    establishmentCountry: varchar("establishment_country", { length: 2 }),
    taxablePerson: boolean("taxable_person"),
    siren: varchar("siren", { length: 9 }),
    siret: varchar("siret", { length: 14 }),
    vatNumber: varchar("vat_number", { length: 32 }),
    billingEmail: varchar("billing_email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    paymentTermsDays: integer("payment_terms_days"),
    status: customerStatusEnum("status").notNull().default("active"),
    riskLevel: customerRiskLevelEnum("risk_level")
      .notNull()
      .default("normal"),
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
    check("customers_billing_identity_check", sql`(${table.siren} is null or ${table.siren} ~ '^[0-9]{9}$') and (${table.siren} is null or ${table.siret} is null or left(${table.siret}, 9) = ${table.siren}) and (${table.billingCountry} is null or ${table.billingCountry} ~ '^[A-Z]{2}$') and (${table.establishmentCountry} is null or ${table.establishmentCountry} ~ '^[A-Z]{2}$')`),
    index("customers_organization_id_idx").on(table.organizationId),
    index("customers_name_idx").on(table.name),
    index("customers_siret_idx").on(table.siret),
    index("customers_status_idx").on(table.status),
    index("customers_type_idx").on(table.type),
    unique("customers_id_organization_id_unique").on(
      table.id,
      table.organizationId,
    ),
  ],
);
