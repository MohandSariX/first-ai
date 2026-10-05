import type { ToolContext, Tool } from "@first-ai/tools";
import type { ModelSelection } from "./hybrid-router.js";

export type RunStatus = "completed" | "failed" | "cancelled" | "timeout" | "budget_exceeded";
export interface RunCompletion {
  status: RunStatus | "running"; completedAt?: Date; iterationCount: number; toolCallCount: number;
  inputTokens?: number; outputTokens?: number; finalOutput?: { text: string; agentCode?: string; delegatedBy?: string };
  errorCode?: string; errorMessage?: string;
  provider?: string; modelName?: string; modelProfile?: ModelSelection["modelProfile"]; routingClass?: string; fallbackUsed?: boolean; fallbackReason?: string;
}
// An injected persistence port keeps agents independent of Drizzle/database clients.
export interface RunStore {
  ensureDirector(organizationId: string, configuration: Record<string, unknown>): Promise<string>;
  createRun(input: { id: string; organizationId: string; agentId: string; triggeredByType: string; triggeredById: string; objective: string; modelName: string; status: "running"; startedAt: Date; correlationId: string; provider?: string; modelProfile?: ModelSelection["modelProfile"]; routingClass?: string }): Promise<void>;
  finishRun(organizationId: string, runId: string, changes: RunCompletion): Promise<void>;
  startToolCall(input: { id: string; organizationId: string; agentRunId: string; agentId: string; toolName: string; riskLevel: number; approvalRequired?: boolean; input: unknown; status: "running"; startedAt: Date }): Promise<void>;
  finishToolCall(organizationId: string, callId: string, changes: { status: "completed" | "failed" | "blocked" | "cancelled"; completedAt: Date; output?: unknown; errorCode?: string; errorMessage?: string; approvalRequestId?: string }): Promise<void>;
}
export interface DirectorTool {
  name: string; description: string; parameters: Tool["inputSchema"];
  invoke(input: unknown): Promise<string>;
  rejectInput?(input: unknown): Promise<string>;
}
export interface DirectorExecution {
  agentName?: string;
  instructions?: string;
  runId?: string;
  maxIterations?: number;
  message: string; model: string; tools: readonly DirectorTool[]; signal: AbortSignal;
  onUsage(inputTokens: number, outputTokens: number, iterations: number): void;
}
export type DirectorExecutor = (input: DirectorExecution) => Promise<string>;
export type DirectorContext = ToolContext & { agentId: string; agentRunId: string };
export class DirectorError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "DirectorError"; }
}
