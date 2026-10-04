import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  agents,
  aiSettings,
  agentRuns,
  agentToolCalls,
  agentRunStatusEnum,
  modelProfileEnum,
  contacts,
  customerSites,
  customers,
  leads,
  organizations,
  services,
  users,
} from "./index.js";

describe("database schema exports", () => {
  it("exports the current application tables", () => {
    expect([
      getTableName(organizations),
      getTableName(users),
      getTableName(customers),
      getTableName(contacts),
      getTableName(customerSites),
      getTableName(leads),
      getTableName(services),
      getTableName(agents),
      getTableName(agentRuns),
      getTableName(agentToolCalls),
      getTableName(aiSettings),
    ]).toEqual([
      "organizations",
      "users",
      "customers",
      "contacts",
      "customer_sites",
      "leads",
      "services",
      "agents",
      "agent_runs",
      "agent_tool_calls",
      "ai_settings",
    ]);
  });

  it("keeps organization scope mandatory on tenant-owned tables", () => {
    expect(users.organizationId.notNull).toBe(true);
    expect(customers.organizationId.notNull).toBe(true);
    expect(contacts.organizationId.notNull).toBe(true);
    expect(customerSites.organizationId.notNull).toBe(true);
    expect(leads.organizationId.notNull).toBe(true);
    expect(services.organizationId.notNull).toBe(true);
    expect(agentRuns.organizationId.notNull).toBe(true);
    expect(agentToolCalls.organizationId.notNull).toBe(true);
    expect(agents.organizationId.notNull).toBe(false);
    expect(aiSettings.organizationId.notNull).toBe(true);
  });
  it("exports bounded model profiles and observable run outcomes", () => {
    expect(modelProfileEnum.enumValues).toEqual(["FAST", "STANDARD", "REASONING", "LOCAL_FAST", "LOCAL_STANDARD", "CLOUD_STANDARD", "CLOUD_REASONING"]);
    expect(agentRunStatusEnum.enumValues).toEqual(["queued", "running", "waiting_approval", "completed", "failed", "cancelled", "timeout", "budget_exceeded"]);
  });
});
