import { and, eq } from "drizzle-orm";

import type { createDatabaseClient } from "../client.js";
import { agents, agentRuns, agentToolCalls } from "../schema/index.js";

// Persistence only: no SDK, prompts or CRM queries live here.
export class AgentObservabilityRepository {
  constructor(private readonly database: ReturnType<typeof createDatabaseClient>) {}

  async ensureDirector(organizationId: string, configuration: Record<string, unknown>): Promise<string> {
    const [row] = await this.database.insert(agents).values({
      organizationId, code: typeof configuration.code === "string" ? configuration.code : "director", name: typeof configuration.name === "string" ? configuration.name : "Director", version: "v1",
      autonomyLevel: 0, modelProfile: "LOCAL_STANDARD", configuration,
    }).onConflictDoUpdate({
      target: [agents.organizationId, agents.code, agents.version],
      set: { configuration, modelProfile: "LOCAL_STANDARD", updatedAt: new Date() },
    }).returning({ id: agents.id });
    if (!row) throw new Error("Unable to persist Director definition.");
    return row.id;
  }

  async createRun(input: typeof agentRuns.$inferInsert): Promise<void> {
    await this.database.insert(agentRuns).values(input);
  }
  async finishRun(organizationId: string, runId: string, changes: Partial<Pick<typeof agentRuns.$inferInsert,
    "status" | "completedAt" | "iterationCount" | "toolCallCount" | "inputTokens" | "outputTokens" | "finalOutput" | "errorCode" | "errorMessage" | "provider" | "modelName" | "modelProfile" | "routingClass" | "fallbackUsed" | "fallbackReason">>): Promise<void> {
    await this.database.update(agentRuns).set(changes).where(and(eq(agentRuns.organizationId, organizationId), eq(agentRuns.id, runId)));
  }
  async startToolCall(input: typeof agentToolCalls.$inferInsert): Promise<void> {
    await this.database.insert(agentToolCalls).values(input);
  }
  async finishToolCall(organizationId: string, callId: string, changes: Partial<Pick<typeof agentToolCalls.$inferInsert,
    "status" | "completedAt" | "output" | "errorCode" | "errorMessage" | "approvalRequestId">>): Promise<void> {
    await this.database.update(agentToolCalls).set(changes).where(and(eq(agentToolCalls.organizationId, organizationId), eq(agentToolCalls.id, callId)));
  }
  async getRun(organizationId: string, runId: string) {
    const [row] = await this.database.select().from(agentRuns).where(and(eq(agentRuns.organizationId, organizationId), eq(agentRuns.id, runId))).limit(1);
    return row;
  }
}
