import { sql } from "drizzle-orm";
import { boolean, check, pgPolicy, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

const tenant = sql`organization_id = (select public.current_organization_id())`;
const administrator = sql`exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER', 'ADMIN'))`;
export const aiSettings = pgTable("ai_settings", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id),
  mode: varchar("mode", { length: 20 }).notNull().default("HYBRID"),
  ollamaBaseUrl: varchar("ollama_base_url", { length: 200 }).notNull().default("http://127.0.0.1:11434"),
  localFastModel: varchar("local_fast_model", { length: 120 }).notNull().default("qwen3:1.7b"),
  localStandardModel: varchar("local_standard_model", { length: 120 }).notNull().default("qwen3:4b-instruct"),
  cloudStandardModel: varchar("cloud_standard_model", { length: 120 }).notNull().default("gpt-5.4-mini"),
  cloudReasoningModel: varchar("cloud_reasoning_model", { length: 120 }).notNull().default("gpt-5.4"),
  fallbackEnabled: boolean("fallback_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("ai_settings_mode_check", sql`${t.mode} in ('LOCAL_ONLY', 'HYBRID', 'CLOUD_ONLY')`),
  pgPolicy("ai_settings_select_own", { for: "select", to: "authenticated", using: tenant }),
  pgPolicy("ai_settings_insert_admin", { for: "insert", to: "authenticated", withCheck: sql`${tenant} and ${administrator}` }),
  pgPolicy("ai_settings_update_admin", { for: "update", to: "authenticated", using: sql`${tenant} and ${administrator}`, withCheck: sql`${tenant} and ${administrator}` }),
]).enableRLS();
