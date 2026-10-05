import { Agent, AgentsError, MaxTurnsExceededError, OpenAIProvider, Runner, tool } from "@openai/agents";

import { DirectorError, type DirectorExecutor } from "../types.js";
import { DIRECTOR_CONFIG } from "./config.js";
import { currentDirectorInstructions } from "./instructions.js";

// Only exported via the server-only entry point. Never import into a client component.
export const executeDirector: DirectorExecutor = async (input) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new DirectorError("OPENAI_NOT_CONFIGURED", "Le raisonnement cloud est indisponible : OpenAI n’est pas configuré. Le CRM reste accessible.");
  const provider = new OpenAIProvider({ apiKey, useResponses: true });
  const runner = new Runner({
    modelProvider: provider, traceIncludeSensitiveData: false,
    workflowName: "first-ai-director-v1",
    groupId: input.runId,
  });
  const agent = new Agent({
    name: "director:v1", instructions: currentDirectorInstructions(), model: input.model,
    modelSettings: { maxTokens: DIRECTOR_CONFIG.maxOutputTokens, parallelToolCalls: false, store: false },
    tools: input.tools.map((definition) => tool({
      name: definition.name, description: definition.description,
      parameters: definition.parameters, strict: true,
      errorFunction: async (_context, error) => {
        if (!(error instanceof Error) || !("toolInvocation" in error) || !definition.rejectInput) {
          throw new DirectorError("TOOL_ERROR", "Lecture des données impossible.");
        }
        // SDK validation happens before execute; persist rejected calls as well.
        // The SDK exposes invocation metadata structurally, not its internal error class.
        const invocation = error.toolInvocation as { input?: unknown } | undefined;
        const raw = typeof invocation?.input === "string" ? invocation.input : "";
        let rejected: unknown;
        try { rejected = JSON.parse(raw); } catch { rejected = { invalidJson: raw }; }
        return definition.rejectInput(rejected);
      },
      execute: (args) => definition.invoke(args),
    })),
  });
  runner.on("agent_start", (context) => {
    input.onUsage(context.usage.inputTokens, context.usage.outputTokens, context.usage.requests);
  });
  runner.on("agent_tool_start", (context) => {
    input.onUsage(context.usage.inputTokens, context.usage.outputTokens, context.usage.requests);
  });
  try {
    const result = await runner.run(agent, input.message, {
      maxTurns: input.maxIterations ?? DIRECTOR_CONFIG.maxIterations, signal: input.signal,
    });
    input.onUsage(result.state.usage.inputTokens, result.state.usage.outputTokens, result.state.usage.requests);
    return result.finalOutput ?? "";
  } catch (error: unknown) {
    if (error instanceof AgentsError && error.state) {
      const usage = error.state.usage;
      input.onUsage(usage.inputTokens, usage.outputTokens, usage.requests);
    }
    if (input.signal.aborted) throw input.signal.reason;
    if (error instanceof MaxTurnsExceededError) throw new DirectorError("BUDGET_EXCEEDED", "La limite de cette demande a été atteinte. Précisez votre question.");
    throw error;
  } finally {
    await provider.close();
  }
};
