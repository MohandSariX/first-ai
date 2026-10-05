import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgPolicy, pgTable, text, timestamp, unique, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

import { organizations } from "./organizations.js";

export const agentStatusEnum = pgEnum("agent_status", ["draft", "active", "disabled", "deprecated"]);
// Retain historical values; new runs use the four hybrid profiles.
export const modelProfileEnum = pgEnum("model_profile", ["FAST", "STANDARD", "REASONING", "LOCAL_FAST", "LOCAL_STANDARD", "CLOUD_STANDARD", "CLOUD_REASONING"]);
export const agentRunStatusEnum = pgEnum("agent_run_status", ["queued", "running", "waiting_approval", "completed", "failed", "cancelled", "timeout", "budget_exceeded"]);
export const agentToolCallStatusEnum = pgEnum("agent_tool_call_status", ["pending", "running", "completed", "failed", "blocked", "waiting_approval", "cancelled"]);
const time = (name: string) => timestamp(name, { withTimezone: true });
const readPolicy = (name: string, organizationId: AnyPgColumn) => pgPolicy(name, {
  for: "select", to: "authenticated", using: sql`${organizationId} = (select public.current_organization_id())`,
});

// Global definitions are allowed by the model but deliberately not exposed by RLS.
// v1 creates organization-owned, versioned Director definitions lazily.
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  version: varchar("version", { length: 40 }).notNull(),
  status: agentStatusEnum("status").notNull().default("active"),
  autonomyLevel: integer("autonomy_level").notNull().default(0),
  modelProfile: modelProfileEnum("model_profile").notNull().default("STANDARD"),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("agents_organization_code_version_unique").on(t.organizationId, t.code, t.version),
  unique("agents_id_organization_unique").on(t.id, t.organizationId),
  check("agents_autonomy_level_check", sql`${t.autonomyLevel} between 0 and 4`),
  readPolicy("agents_select_own_organization", t.organizationId),
]).enableRLS();

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  agentId: uuid("agent_id").notNull(),
  parentRunId: uuid("parent_run_id").references((): AnyPgColumn => agentRuns.id),
  triggeredByType: varchar("triggered_by_type", { length: 40 }).notNull(),
  triggeredById: uuid("triggered_by_id").notNull(),
  objective: text("objective").notNull(),
  modelName: varchar("model_name", { length: 120 }).notNull(),
  provider: varchar("provider", { length: 40 }),
  modelProfile: modelProfileEnum("model_profile"),
  routingClass: varchar("routing_class", { length: 40 }),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  fallbackReason: varchar("fallback_reason", { length: 80 }),
  status: agentRunStatusEnum("status").notNull().default("queued"),
  startedAt: time("started_at"),
  completedAt: time("completed_at"),
  iterationCount: integer("iteration_count").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }),
  finalOutput: jsonb("final_output").$type<{ text: string; agentCode?: string; delegatedBy?: string }>(),
  errorCode: varchar("error_code", { length: 80 }),
  errorMessage: text("error_message"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  unique("agent_runs_id_organization_unique").on(t.id, t.organizationId),
  unique("agent_runs_id_organization_agent_unique").on(t.id, t.organizationId, t.agentId),
  foreignKey({ name: "agent_runs_agent_organization_fk", columns: [t.agentId, t.organizationId], foreignColumns: [agents.id, agents.organizationId] }),
  foreignKey({ name: "agent_runs_parent_organization_fk", columns: [t.parentRunId, t.organizationId], foreignColumns: [t.id, t.organizationId] }),
  index("agent_runs_organization_started_idx").on(t.organizationId, t.startedAt),
  index("agent_runs_agent_status_idx").on(t.agentId, t.status),
  index("agent_runs_parent_idx").on(t.parentRunId),
  index("agent_runs_correlation_idx").on(t.correlationId),
  check("agent_runs_counters_check", sql`${t.iterationCount} >= 0 and ${t.toolCallCount} >= 0 and coalesce(${t.inputTokens}, 0) >= 0 and coalesce(${t.outputTokens}, 0) >= 0`),
  pgPolicy("agent_runs_select_own_organization", { for: "select", to: "authenticated",
    using: sql`${t.organizationId} = (select public.current_organization_id()) and ${t.triggeredByType} = 'user' and ${t.triggeredById} = (select id from public.users where auth_user_id = (select auth.uid()))`,
  }),
]).enableRLS();

export const agentToolCalls = pgTable("agent_tool_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  agentRunId: uuid("agent_run_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  toolName: varchar("tool_name", { length: 120 }).notNull(),
  riskLevel: integer("risk_level").notNull(),
  input: jsonb("input").$type<unknown>(),
  output: jsonb("output").$type<unknown>(),
  status: agentToolCallStatusEnum("status").notNull().default("pending"),
  startedAt: time("started_at"),
  completedAt: time("completed_at"),
  errorCode: varchar("error_code", { length: 80 }),
  errorMessage: text("error_message"),
  approvalRequired: boolean("approval_required").notNull().default(false),
  approvalRequestId: uuid("approval_request_id"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "agent_tool_calls_run_organization_agent_fk", columns: [t.agentRunId, t.organizationId, t.agentId], foreignColumns: [agentRuns.id, agentRuns.organizationId, agentRuns.agentId] }),
  foreignKey({ name: "agent_tool_calls_agent_organization_fk", columns: [t.agentId, t.organizationId], foreignColumns: [agents.id, agents.organizationId] }),
  index("agent_tool_calls_run_idx").on(t.agentRunId),
  index("agent_tool_calls_agent_idx").on(t.agentId),
  check("agent_tool_calls_risk_check", sql`${t.riskLevel} between 0 and 4`),
  pgPolicy("agent_tool_calls_select_own_organization", { for: "select", to: "authenticated",
    using: sql`${t.organizationId} = (select public.current_organization_id()) and exists (select 1 from public.agent_runs where id = ${t.agentRunId})`,
  }),
]).enableRLS();
