import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "../client.js";
import { agents, agentRuns, agentToolCalls, organizations } from "../schema/index.js";
import { AgentObservabilityRepository } from "./agent-observability.js";

describe("privileged observability persistence remains tenant-scoped", () => {
  const db = createDatabaseClient();
  const repository = new AgentObservabilityRepository(db);
  const organizationA = randomUUID(); const organizationB = randomUUID();
  const runA = randomUUID(); const runB = randomUUID(); const callB = randomUUID();
  let safe = false;
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("Local database required.");
    safe = true;
    await db.insert(organizations).values([{ id: organizationA, name: "Fictional trace A" }, { id: organizationB, name: "Fictional trace B" }]);
    for (const [organizationId, id] of [[organizationA, runA], [organizationB, runB]]) {
      const agentId = await repository.ensureDirector(organizationId!, {});
      expect(await repository.ensureDirector(organizationId!, {})).toBe(agentId);
      await repository.createRun({
        id: id!, organizationId: organizationId!, agentId, triggeredByType: "user", triggeredById: randomUUID(),
        objective: "Fictional test request", modelName: "mock", correlationId: randomUUID(), status: "running", startedAt: new Date(),
      });
      if (id === runB) await repository.startToolCall({
        id: callB, organizationId: organizationB, agentId, agentRunId: runB, toolName: "customers.get",
        riskLevel: 0, input: {}, startedAt: new Date(), status: "running",
      });
    }
  });
  afterAll(async () => {
    if (safe) {
      await db.delete(agentToolCalls).where(eq(agentToolCalls.id, callB));
      await db.delete(agentRuns).where(inArray(agentRuns.id, [runA, runB]));
      await db.delete(agents).where(inArray(agents.organizationId, [organizationA, organizationB]));
      await db.delete(organizations).where(inArray(organizations.id, [organizationA, organizationB]));
    }
    await db.$client.end();
  });
  it("persists completion with usage and refuses cross-tenant reads and updates", async () => {
    await repository.finishRun(organizationA, runA, { status: "completed", completedAt: new Date(), inputTokens: 10, outputTokens: 2, toolCallCount: 0, iterationCount: 1, finalOutput: { text: "OK" }, provider: "openai", modelProfile: "CLOUD_STANDARD", routingClass: "SUMMARY", fallbackUsed: true, fallbackReason: "OLLAMA_UNAVAILABLE" });
    expect(await repository.getRun(organizationA, runA)).toMatchObject({ status: "completed", inputTokens: 10, finalOutput: { text: "OK" }, estimatedCost: null, provider: "openai", modelProfile: "CLOUD_STANDARD", routingClass: "SUMMARY", fallbackUsed: true, fallbackReason: "OLLAMA_UNAVAILABLE" });
    expect(await repository.getRun(organizationA, runB)).toBeUndefined();
    await repository.finishRun(organizationA, runB, { status: "completed" });
    expect(await repository.getRun(organizationB, runB)).toMatchObject({ status: "running" });
    await repository.finishToolCall(organizationA, callB, { status: "completed" });
    const [call] = await db.select().from(agentToolCalls).where(eq(agentToolCalls.id, callB));
    expect(call?.status).toBe("running");
    await repository.finishToolCall(organizationB, callB, { status: "completed", output: { success: true }, completedAt: new Date() });
    const [finished] = await db.select().from(agentToolCalls).where(eq(agentToolCalls.id, callB));
    expect(finished?.status).toBe("completed");
  });
});
