import {
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
