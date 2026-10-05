import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, numeric, pgEnum, pgPolicy, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { INFESTATION_LEVELS, JOB_PRIORITIES, JOB_STATUSES, QUOTE_STATUSES } from "@first-ai/schemas";
import { organizations } from "./organizations.js";
import { customers } from "./customers.js";
import { customerSites } from "./customer-sites.js";
import { services } from "./services.js";
import { users } from "./users.js";
import { agents } from "./agent-observability.js";

export const quoteStatusEnum = pgEnum("quote_status", QUOTE_STATUSES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const jobPriorityEnum = pgEnum("job_priority", JOB_PRIORITIES);
export const infestationLevelEnum = pgEnum("infestation_level", INFESTATION_LEVELS);
const timestamps = () => ({ createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 });
const tenant = sql`organization_id = (select public.current_organization_id())`;

// Future opportunity/contract/pest/employee/document relations are deliberately omitted.
// quote_items adds organization_id to enforce quote/service tenant integrity without triggers.
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  customerId: uuid("customer_id").notNull(), siteId: uuid("site_id").notNull(), quoteNumber: varchar("quote_number", { length: 40 }).notNull(), status: quoteStatusEnum("status").notNull().default("draft"),
  subtotal: amount("subtotal").notNull().default("0"), taxAmount: amount("tax_amount").notNull().default("0"), total: amount("total").notNull().default("0"), estimatedCost: amount("estimated_cost").notNull().default("0"), estimatedMargin: amount("estimated_margin").notNull().default("0"), estimatedMarginRate: numeric("estimated_margin_rate", { precision: 24, scale: 3 }),
  validUntil: date("valid_until"), sentAt: timestamp("sent_at", { withTimezone: true }), viewedAt: timestamp("viewed_at", { withTimezone: true }), acceptedAt: timestamp("accepted_at", { withTimezone: true }), rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull(), createdByAgentId: uuid("created_by_agent_id"), notes: text("notes"), ...timestamps(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [
  unique("quotes_org_number_unique").on(t.organizationId, t.quoteNumber), unique("quotes_id_org_unique").on(t.id, t.organizationId), unique("quotes_id_customer_site_org_unique").on(t.id, t.customerId, t.siteId, t.organizationId),
  foreignKey({ name: "quotes_customer_org_fk", columns: [t.customerId, t.organizationId], foreignColumns: [customers.id, customers.organizationId] }),
  foreignKey({ name: "quotes_site_customer_org_fk", columns: [t.siteId, t.customerId, t.organizationId], foreignColumns: [customerSites.id, customerSites.customerId, customerSites.organizationId] }),
  foreignKey({ name: "quotes_creator_org_fk", columns: [t.createdByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "quotes_agent_org_fk", columns: [t.createdByAgentId, t.organizationId], foreignColumns: [agents.id, agents.organizationId] }),
  check("quotes_amounts_check", sql`${t.subtotal} >= 0 and ${t.taxAmount} >= 0 and ${t.estimatedCost} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxAmount} and ${t.estimatedMargin} = ${t.subtotal} - ${t.estimatedCost}`),
  index("quotes_org_status_created_idx").on(t.organizationId, t.status, t.createdAt), index("quotes_org_customer_idx").on(t.organizationId, t.customerId),
  pgPolicy("quotes_select_own", { for: "select", to: "authenticated", using: sql`${tenant} and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role <> 'TECHNICIAN')` }),
]).enableRLS();

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), quoteId: uuid("quote_id").notNull(), serviceId: uuid("service_id"), description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 9, scale: 3 }).notNull(), unitPrice: amount("unit_price").notNull(), taxRate: numeric("tax_rate", { precision: 6, scale: 3 }).notNull(), costEstimate: amount("cost_estimate").notNull().default("0"), sortOrder: integer("sort_order").notNull().default(0), ...timestamps(),
}, t => [
  foreignKey({ name: "quote_items_quote_org_fk", columns: [t.quoteId, t.organizationId], foreignColumns: [quotes.id, quotes.organizationId] }).onDelete("cascade"),
  foreignKey({ name: "quote_items_service_org_fk", columns: [t.serviceId, t.organizationId], foreignColumns: [services.id, services.organizationId] }),
  check("quote_items_values_check", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.costEstimate} >= 0 and ${t.taxRate} between 0 and 100 and ${t.sortOrder} >= 0`),
  index("quote_items_org_quote_order_idx").on(t.organizationId, t.quoteId, t.sortOrder),
  pgPolicy("quote_items_select_quote", { for: "select", to: "authenticated", using: sql`${tenant} and exists (select 1 from public.quotes where id = quote_items.quote_id and organization_id = quote_items.organization_id)` }),
]).enableRLS();

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), customerId: uuid("customer_id").notNull(), siteId: uuid("site_id").notNull(), quoteId: uuid("quote_id"), serviceId: uuid("service_id").notNull(),
  infestationLevel: infestationLevelEnum("infestation_level").notNull().default("unknown"), status: jobStatusEnum("status").notNull().default("draft"), priority: jobPriorityEnum("priority").notNull().default("normal"),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }), scheduledEnd: timestamp("scheduled_end", { withTimezone: true }), actualStart: timestamp("actual_start", { withTimezone: true }), actualEnd: timestamp("actual_end", { withTimezone: true }),
  // Temporary user assignment, not a counterfeit Employee identity.
  assignedUserId: uuid("assigned_user_id"), price: amount("price").notNull().default("0"), estimatedCost: amount("estimated_cost").notNull().default("0"), actualCost: amount("actual_cost"), estimatedMargin: amount("estimated_margin").notNull().default("0"), actualMargin: amount("actual_margin"),
  description: text("description").notNull(), internalNotes: text("internal_notes"), customerNotes: text("customer_notes"), createdByUserId: uuid("created_by_user_id").notNull(), createdByAgentId: uuid("created_by_agent_id"), ...timestamps(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [
  unique("jobs_id_org_unique").on(t.id, t.organizationId), unique("jobs_quote_org_unique").on(t.quoteId, t.organizationId),
  foreignKey({ name: "jobs_customer_org_fk", columns: [t.customerId, t.organizationId], foreignColumns: [customers.id, customers.organizationId] }),
  foreignKey({ name: "jobs_site_customer_org_fk", columns: [t.siteId, t.customerId, t.organizationId], foreignColumns: [customerSites.id, customerSites.customerId, customerSites.organizationId] }),
  foreignKey({ name: "jobs_quote_customer_site_org_fk", columns: [t.quoteId, t.customerId, t.siteId, t.organizationId], foreignColumns: [quotes.id, quotes.customerId, quotes.siteId, quotes.organizationId] }),
  foreignKey({ name: "jobs_service_org_fk", columns: [t.serviceId, t.organizationId], foreignColumns: [services.id, services.organizationId] }),
  foreignKey({ name: "jobs_assignee_org_fk", columns: [t.assignedUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "jobs_creator_org_fk", columns: [t.createdByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "jobs_agent_org_fk", columns: [t.createdByAgentId, t.organizationId], foreignColumns: [agents.id, agents.organizationId] }),
  check("jobs_amounts_check", sql`${t.price} >= 0 and ${t.estimatedCost} >= 0 and (${t.actualCost} is null or ${t.actualCost} >= 0) and ${t.estimatedMargin} = ${t.price} - ${t.estimatedCost}`),
  check("jobs_schedule_check", sql`(${t.scheduledStart} is null and ${t.scheduledEnd} is null) or (${t.scheduledStart} is not null and ${t.scheduledEnd} is not null and ${t.scheduledEnd} > ${t.scheduledStart})`),
  index("jobs_org_schedule_idx").on(t.organizationId, t.scheduledStart), index("jobs_org_status_idx").on(t.organizationId, t.status), index("jobs_org_assignee_idx").on(t.organizationId, t.assignedUserId),
  pgPolicy("jobs_select_own", { for: "select", to: "authenticated", using: sql`${tenant} and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and (role <> 'TECHNICIAN' or id = jobs.assigned_user_id))` }),
]).enableRLS();

export const jobReports = pgTable("job_reports", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), jobId: uuid("job_id").notNull(), technicianId: uuid("technician_id").notNull(),
  observations: text("observations"), infestationLevelBefore: infestationLevelEnum("infestation_level_before").notNull().default("unknown"), infestationLevelAfter: infestationLevelEnum("infestation_level_after").notNull().default("unknown"), treatmentPerformed: text("treatment_performed"), productsUsedSummary: text("products_used_summary"), recommendations: text("recommendations"), followUpRequired: boolean("follow_up_required").notNull().default(false), followUpDate: date("follow_up_date"), completedAt: timestamp("completed_at", { withTimezone: true }), ...timestamps(),
}, t => [
  unique("job_reports_org_job_unique").on(t.organizationId, t.jobId),
  foreignKey({ name: "job_reports_job_org_fk", columns: [t.jobId, t.organizationId], foreignColumns: [jobs.id, jobs.organizationId] }),
  foreignKey({ name: "job_reports_technician_org_fk", columns: [t.technicianId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  check("job_reports_follow_up_check", sql`${t.followUpDate} is null or ${t.followUpRequired}`),
  pgPolicy("job_reports_select_job", { for: "select", to: "authenticated", using: sql`${tenant} and exists (select 1 from public.jobs where id = job_reports.job_id and organization_id = job_reports.organization_id) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role <> 'ACCOUNTANT')` }),
]).enableRLS();
