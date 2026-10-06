import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { INVOICE_STATUSES, type InvoiceDocumentSnapshot } from "@first-ai/schemas";
import { organizations } from "./organizations.js";
import { customers } from "./customers.js";
import { quotes, jobs } from "./operations.js";
import { users } from "./users.js";
import { agents } from "./agent-observability.js";
import { services } from "./services.js";
import { transactionTypeEnum, operationCategoryEnum, fiscalTerritoryEnum, vatTreatmentEnum } from "./billing-enums.js";

export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 });
const timestamps = () => ({ createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
// Contract/delivery/accounting fields remain deferred, not simulated.
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  draftReference: varchar("draft_reference", { length: 50 }).notNull().default(sql`('BROUILLON-' || gen_random_uuid()::text)`),
  invoiceNumber: varchar("invoice_number", { length: 40 }), status: invoiceStatusEnum("status").notNull().default("draft"),
  customerId: uuid("customer_id").notNull(), quoteId: uuid("quote_id"), jobId: uuid("job_id"),
  issueDate: date("issue_date"), dueDate: date("due_date").notNull(), issuedAt: timestamp("issued_at", { withTimezone: true }),
  subtotal: amount("subtotal").notNull().default("0"), taxAmount: amount("tax_amount").notNull().default("0"), total: amount("total").notNull().default("0"),
  amountPaid: amount("amount_paid").notNull().default("0"), amountDue: amount("amount_due").notNull().default("0"), paidAt: timestamp("paid_at", { withTimezone: true }),
  documentSnapshot: jsonb("document_snapshot").$type<InvoiceDocumentSnapshot>(),
  transactionType: transactionTypeEnum("transaction_type"), operationCategory: operationCategoryEnum("operation_category"),
  fiscalTerritory: fiscalTerritoryEnum("fiscal_territory"), vatTreatment: vatTreatmentEnum("vat_treatment"), vatReason: varchar("vat_reason", { length: 500 }),
  notes: text("notes"), internalNotes: text("internal_notes"), createdByUserId: uuid("created_by_user_id").notNull(), createdByAgentId: uuid("created_by_agent_id"),
  ...timestamps(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [
  unique("invoices_org_number_unique").on(t.organizationId, t.invoiceNumber), unique("invoices_id_org_unique").on(t.id, t.organizationId),
  unique("invoices_org_draft_reference_unique").on(t.organizationId, t.draftReference),
  unique("invoices_id_customer_org_unique").on(t.id, t.customerId, t.organizationId),
  foreignKey({ name: "invoices_customer_org_fk", columns: [t.customerId, t.organizationId], foreignColumns: [customers.id, customers.organizationId] }),
  foreignKey({ name: "invoices_quote_customer_org_fk", columns: [t.quoteId, t.customerId, t.organizationId], foreignColumns: [quotes.id, quotes.customerId, quotes.organizationId] }),
  foreignKey({ name: "invoices_job_customer_org_fk", columns: [t.jobId, t.customerId, t.organizationId], foreignColumns: [jobs.id, jobs.customerId, jobs.organizationId] }),
  foreignKey({ name: "invoices_creator_org_fk", columns: [t.createdByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "invoices_agent_org_fk", columns: [t.createdByAgentId, t.organizationId], foreignColumns: [agents.id, agents.organizationId] }),
  check("invoices_dates_check", sql`${t.dueDate} >= ${t.issueDate}`),
  check("invoices_totals_check", sql`${t.subtotal} >= 0 and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxAmount}`),
  check("invoices_balance_check", sql`${t.amountPaid} >= 0 and ${t.amountDue} >= 0 and ${t.amountPaid} + ${t.amountDue} = ${t.total}`),
  check("invoices_issued_check", sql`${t.status} in ('draft', 'cancelled') or ${t.issuedAt} is not null`),
  check("invoices_fiscal_number_check", sql`(${t.status} <> 'draft' or (${t.invoiceNumber} is null and ${t.issueDate} is null and ${t.issuedAt} is null)) and (${t.status} in ('draft','cancelled') or (${t.invoiceNumber} is not null and ${t.issueDate} is not null))`),
  index("invoices_org_status_due_idx").on(t.organizationId, t.status, t.dueDate), index("invoices_org_customer_idx").on(t.organizationId, t.customerId),
  pgPolicy("invoices_select_own", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT','READ_ONLY'))` }),
]).enableRLS();

// Private transactional high-water marks, not PostgreSQL sequences. No user-facing policy.
// lastInvoiceId deliberately has no FK: deleting a fixture/document cannot release a number.
export const invoiceNumberCounters = pgTable("invoice_number_counters", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fiscalYear: integer("fiscal_year").notNull(), lastNumber: integer("last_number").notNull(),
  lastIssuedAt: timestamp("last_issued_at", { withTimezone: true }).notNull(), lastIssueDate: date("last_issue_date").notNull(),
  lastInvoiceId: uuid("last_invoice_id").notNull(),
}, t => [primaryKey({ columns: [t.organizationId, t.fiscalYear] }),
  check("invoice_number_counters_values_check", sql`${t.fiscalYear} between 1000 and 9999 and ${t.lastNumber} between 1 and 999999`),
]).enableRLS();

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), invoiceId: uuid("invoice_id").notNull(), serviceId: uuid("service_id"),
  description: text("description").notNull(), quantity: numeric("quantity", { precision: 9, scale: 3 }).notNull(), unitPrice: amount("unit_price").notNull(), taxRate: numeric("tax_rate", { precision: 6, scale: 3 }).notNull(), sortOrder: integer("sort_order").notNull().default(0), ...timestamps(),
}, t => [
  foreignKey({ name: "invoice_items_invoice_org_fk", columns: [t.invoiceId, t.organizationId], foreignColumns: [invoices.id, invoices.organizationId] }).onDelete("cascade"),
  foreignKey({ name: "invoice_items_service_org_fk", columns: [t.serviceId, t.organizationId], foreignColumns: [services.id, services.organizationId] }),
  check("invoice_items_values_check", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.taxRate} between 0 and 100 and ${t.sortOrder} between 0 and 200`),
  index("invoice_items_org_invoice_order_idx").on(t.organizationId, t.invoiceId, t.sortOrder),
  pgPolicy("invoice_items_select_invoice", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = invoice_items.invoice_id and organization_id = invoice_items.organization_id)` }),
]).enableRLS();
