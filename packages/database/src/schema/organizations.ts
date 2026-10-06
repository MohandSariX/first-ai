import {
  check,
  boolean,
  numeric,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { legalEntityTypeEnum, vatRegimeEnum } from "./billing-enums.js";
import { sql } from "drizzle-orm";
import type { SellerInvoiceTerms } from "@first-ai/schemas";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  legalEntityType: legalEntityTypeEnum("legal_entity_type"),
  legalForm: varchar("legal_form", { length: 80 }),
  siren: varchar("siren", { length: 9 }),
  registration: varchar("registration", { length: 255 }),
  shareCapital: numeric("share_capital", { precision: 14, scale: 2 }),
  vatRegime: vatRegimeEnum("vat_regime"),
  vatOnDebits: boolean("vat_on_debits"),
  companySize: varchar("company_size", { length: 16 }),
  invoiceTerms: jsonb("invoice_terms").$type<SellerInvoiceTerms>(),
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
}, t => [
  check("organizations_fiscal_identity_check", sql`(${t.siren} is null or ${t.siren} ~ '^[0-9]{9}$') and (${t.siren} is null or ${t.siret} is null or left(${t.siret}, 9) = ${t.siren}) and (${t.shareCapital} is null or ${t.shareCapital} >= 0) and (${t.companySize} is null or ${t.companySize} in ('micro','sme','eti','large'))`),
]);
