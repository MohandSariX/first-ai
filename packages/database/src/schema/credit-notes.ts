import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { CREDIT_NOTE_STATUSES, type CreditNoteSnapshot } from "@first-ai/schemas";
import { organizations } from "./organizations.js";
import { invoices } from "./invoices.js";
import { users } from "./users.js";

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const timestamps = () => ({ createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
export const creditNoteStatusEnum = pgEnum("credit_note_status", CREDIT_NOTE_STATUSES);
export const creditNotes = pgTable("credit_notes", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  originalInvoiceId: uuid("original_invoice_id").notNull(), number: varchar("number", { length: 40 }),
  status: creditNoteStatusEnum("status").notNull().default("draft"), correctionType: varchar("correction_type", { length: 16 }).notNull(),
  reason: text("reason").notNull(), idempotencyKey: uuid("idempotency_key").notNull(),
  issueDate: date("issue_date"), issuedAt: timestamp("issued_at", { withTimezone: true }),
  subtotal: money("subtotal").notNull().default("0"), taxAmount: money("tax_amount").notNull().default("0"), total: money("total").notNull().default("0"),
  createdByUserId: uuid("created_by_user_id").notNull(), snapshot: jsonb("snapshot").$type<CreditNoteSnapshot>(), ...timestamps(),
}, t => [
  unique("credit_notes_id_invoice_org_unique").on(t.id, t.originalInvoiceId, t.organizationId),
  unique("credit_notes_org_number_unique").on(t.organizationId, t.number), unique("credit_notes_org_key_unique").on(t.organizationId, t.idempotencyKey),
  foreignKey({ name: "credit_notes_invoice_org_fk", columns: [t.originalInvoiceId, t.organizationId], foreignColumns: [invoices.id, invoices.organizationId] }),
  foreignKey({ name: "credit_notes_creator_org_fk", columns: [t.createdByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  check("credit_notes_values_check", sql`${t.correctionType} in ('partial','full') and length(trim(${t.reason})) > 0 and ${t.subtotal} >= 0 and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxAmount}`),
  check("credit_notes_issue_check", sql`(${t.status} = 'issued' and ${t.number} is not null and ${t.issueDate} is not null and ${t.issuedAt} is not null and ${t.snapshot} is not null) or (${t.status} <> 'issued' and ${t.number} is null and ${t.issueDate} is null and ${t.issuedAt} is null and ${t.snapshot} is null)`),
  index("credit_notes_org_invoice_idx").on(t.organizationId, t.originalInvoiceId),
  pgPolicy("credit_notes_select_invoice", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = credit_notes.original_invoice_id and organization_id = credit_notes.organization_id)` }),
]).enableRLS();
export const creditNoteItems = pgTable("credit_note_items", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  creditNoteId: uuid("credit_note_id").notNull(), originalInvoiceId: uuid("original_invoice_id").notNull(),
  originalLineIndex: integer("original_line_index").notNull(), subtotal: money("subtotal").notNull(),
  taxAmount: money("tax_amount").notNull().default("0"), total: money("total").notNull(), ...timestamps(),
}, t => [
  unique("credit_note_items_note_line_unique").on(t.creditNoteId, t.originalLineIndex),
  foreignKey({ name: "credit_note_items_parent_org_fk", columns: [t.creditNoteId, t.originalInvoiceId, t.organizationId], foreignColumns: [creditNotes.id, creditNotes.originalInvoiceId, creditNotes.organizationId] }).onDelete("cascade"),
  check("credit_note_items_values_check", sql`${t.originalLineIndex} between 0 and 199 and ${t.subtotal} > 0 and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxAmount}`),
  index("credit_note_items_org_invoice_idx").on(t.organizationId, t.originalInvoiceId),
  pgPolicy("credit_note_items_select_parent", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and exists (select 1 from public.credit_notes where id = credit_note_items.credit_note_id and organization_id = credit_note_items.organization_id)` }),
]).enableRLS();
export const creditNoteNumberCounters = pgTable("credit_note_number_counters", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fiscalYear: integer("fiscal_year").notNull(), lastNumber: integer("last_number").notNull(),
  lastIssuedAt: timestamp("last_issued_at", { withTimezone: true }).notNull(), lastIssueDate: date("last_issue_date").notNull(), lastCreditNoteId: uuid("last_credit_note_id").notNull(),
}, t => [primaryKey({ columns: [t.organizationId, t.fiscalYear] }), check("credit_note_counters_values_check", sql`${t.fiscalYear} between 1000 and 9999 and ${t.lastNumber} between 1 and 999999`)]).enableRLS();
