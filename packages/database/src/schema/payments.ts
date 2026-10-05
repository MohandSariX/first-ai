import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, pgEnum, pgPolicy, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@first-ai/schemas";
import { organizations } from "./organizations.js";
import { invoices } from "./invoices.js";
import { users } from "./users.js";

export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
// Invoice allocation is mandatory in v1. Bank transactions/provider IDs are deferred.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  invoiceId: uuid("invoice_id").notNull(), customerId: uuid("customer_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), method: paymentMethodEnum("method").notNull(), status: paymentStatusEnum("status").notNull().default("completed"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(), reference: varchar("reference", { length: 200 }).notNull().default(""),
  idempotencyKey: uuid("idempotency_key").notNull(), createdByUserId: uuid("created_by_user_id").notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }), cancelledByUserId: uuid("cancelled_by_user_id"), cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique("payments_org_idempotency_unique").on(t.organizationId, t.idempotencyKey),
  foreignKey({ name: "payments_invoice_customer_org_fk", columns: [t.invoiceId, t.customerId, t.organizationId], foreignColumns: [invoices.id, invoices.customerId, invoices.organizationId] }),
  foreignKey({ name: "payments_creator_org_fk", columns: [t.createdByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "payments_canceller_org_fk", columns: [t.cancelledByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  check("payments_amount_check", sql`${t.amount} > 0`),
  check("payments_cancellation_check", sql`(${t.status} = 'completed' and ${t.cancelledAt} is null and ${t.cancelledByUserId} is null and ${t.cancellationReason} is null) or (${t.status} = 'cancelled' and ${t.cancelledAt} is not null and ${t.cancelledByUserId} is not null and ${t.cancellationReason} is not null and length(trim(${t.cancellationReason})) > 0)`),
  index("payments_org_invoice_date_idx").on(t.organizationId, t.invoiceId, t.paidAt),
  pgPolicy("payments_select_invoice", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = payments.invoice_id and organization_id = payments.organization_id)` }),
]).enableRLS();
