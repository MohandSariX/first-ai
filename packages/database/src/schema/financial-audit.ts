import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgPolicy, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

// Bounded event data, never arbitrary before/after objects, secrets or reasoning.
export const financialAuditEvents = pgTable("financial_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  entityType: varchar("entity_type", { length: 24 }).notNull(), entityId: uuid("entity_id").notNull(), eventType: varchar("event_type", { length: 40 }).notNull(),
  actorUserId: uuid("actor_user_id").notNull(), actorType: varchar("actor_type", { length: 16 }).notNull().default("user"), correlationId: uuid("correlation_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | string[] | null>>().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ name: "financial_audit_actor_org_fk", columns: [t.actorUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  check("financial_audit_event_check", sql`${t.eventType} in ('invoice.issued','invoice.cancelled','invoice.status_changed','invoice.metadata_changed','credit_note.issued','credit_note.cancelled','payment.recorded','payment.cancelled','billing.seller_changed','billing.customer_changed','billing.terms_changed','invoice.artifact_persisted','credit_note.artifact_persisted','billing.retention_changed','billing.archive_exported','billing.archive_verified')`),
  check("financial_audit_entity_check", sql`${t.entityType} in ('invoice','credit_note','payment','organization','customer') and ${t.actorType} = 'user'`),
  check("financial_audit_metadata_check", sql`jsonb_typeof(${t.metadata}) = 'object' and octet_length(${t.metadata}::text) <= 2048`),
  index("financial_audit_org_time_idx").on(t.organizationId, t.occurredAt, t.id),
  pgPolicy("financial_audit_select_own", { for: "select", to: "authenticated", using: sql`organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT'))` }),
]).enableRLS();
