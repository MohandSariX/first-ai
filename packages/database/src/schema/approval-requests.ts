import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgEnum, pgPolicy, pgTable, text, timestamp, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";
import { agentRuns } from "./agent-observability.js";

export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "executed", "expired", "failed"]);
const time = (name: string) => timestamp(name, { withTimezone: true });
export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestedByUserId: uuid("requested_by_user_id").notNull(),
  agentRunId: uuid("agent_run_id").notNull(),
  specialist: varchar("specialist", { length: 40 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  summary: text("summary").notNull(),
  stateFingerprint: varchar("state_fingerprint", { length: 64 }).notNull(),
  riskLevel: integer("risk_level").notNull().default(1),
  status: approvalStatusEnum("status").notNull().default("pending"),
  expiresAt: time("expires_at").notNull(),
  resolvedAt: time("resolved_at"),
  resolvedByUserId: uuid("resolved_by_user_id"),
  result: jsonb("result").$type<{ resourceId: string; href: string }>(),
  errorCode: varchar("error_code", { length: 80 }),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [
  foreignKey({ name: "approvals_requester_tenant_fk", columns: [t.requestedByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "approvals_resolver_tenant_fk", columns: [t.resolvedByUserId, t.organizationId], foreignColumns: [users.id, users.organizationId] }),
  foreignKey({ name: "approvals_run_tenant_fk", columns: [t.agentRunId, t.organizationId], foreignColumns: [agentRuns.id, agentRuns.organizationId] }),
  index("approvals_requester_created_idx").on(t.organizationId, t.requestedByUserId, t.createdAt),
  check("approvals_risk_check", sql`${t.riskLevel} between 1 and 2`),
  pgPolicy("approvals_select_own", { for: "select", to: "authenticated", using: sql`${t.organizationId} = (select public.current_organization_id()) and ${t.requestedByUserId} = (select id from public.users where auth_user_id = (select auth.uid()))` }),
]).enableRLS();
