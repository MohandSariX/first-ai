import { randomUUID } from "node:crypto";
import { hasPermission, type CurrentBusinessUser } from "@first-ai/auth";
import { directorChatInputSchema } from "@first-ai/schemas";
import type { Tool } from "@first-ai/tools";
import type { AiSettings } from "@first-ai/schemas";
import { classifyWorkload, defaultAiSettings, HybridModelRouter, type ModelSelection } from "./hybrid-router.js";
import { createHybridExecutor } from "./hybrid-executor.js";
import type { AiProvider } from "./providers/provider.js";

import { DIRECTOR_CONFIG } from "./director/config.js";
import { createDirectorTools } from "./director/tools.js";
import { redactText } from "./sanitize.js";
import { DirectorError, type DirectorExecutor, type RunStatus, type RunStore } from "./types.js";

export async function runDirector(input: unknown, user: CurrentBusinessUser, dependencies: {
  registry: Readonly<Record<string, Tool>>; store: RunStore; execute?: DirectorExecutor;
  environment?: Readonly<Record<string, string | undefined>>; signal?: AbortSignal;
  settings?: AiSettings; providers?: Record<"ollama" | "openai", AiProvider>;
}) {
  const { message } = directorChatInputSchema.parse(input);
  if (!hasPermission(user.role, "customers.read")) throw new DirectorError("FORBIDDEN", "Accès à l’assistant non autorisé.");
  if (dependencies.settings && !dependencies.providers) throw new DirectorError("INTERNAL_ERROR", "Configuration des fournisseurs IA incomplète.");
  const objective = redactText(message, 2000);
  let selection: ModelSelection = new HybridModelRouter().resolve(dependencies.settings ?? defaultAiSettings(dependencies.environment), classifyWorkload(objective), DIRECTOR_CONFIG);
  let fallbackReason: string | undefined;
  const model = selection.model;
  const agentId = await dependencies.store.ensureDirector(user.organizationId, { ...DIRECTOR_CONFIG });
  const runId = randomUUID();
  const correlationId = randomUUID();
  await dependencies.store.createRun({
    id: runId, organizationId: user.organizationId, agentId, triggeredByType: "user",
    triggeredById: user.userId, objective, modelName: model,
    status: "running", startedAt: new Date(), correlationId,
    ...(selection ? { provider: selection.provider, modelProfile: selection.modelProfile, routingClass: selection.routingClass } : {}),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DirectorError("TIMEOUT", "L’assistant a dépassé le délai autorisé.")), DIRECTOR_CONFIG.timeoutMs);
  const cancel = () => controller.abort(new DirectorError("CANCELLED", "La demande a été annulée."));
  dependencies.signal?.addEventListener("abort", cancel, { once: true });
  if (dependencies.signal?.aborted) cancel();
  let toolCallCount = 0;
  let iterationCount = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let terminalStatus: RunStatus | undefined;
  const activeTools = new Set<Promise<unknown>>();
  const abortBudget = () => {
    const error = new DirectorError("BUDGET_EXCEEDED", "La limite de cette demande a été atteinte. Précisez votre question.");
    controller.abort(error);
    throw error;
  };
  try {
    const execute = dependencies.settings && selection && dependencies.providers ? createHybridExecutor(dependencies.settings, selection, dependencies.providers, async (next, reason) => {
      selection = next; fallbackReason = reason;
      await dependencies.store.finishRun(user.organizationId, runId, { status: "running", iterationCount, toolCallCount,
        provider: next.provider, modelName: next.model, modelProfile: next.modelProfile, routingClass: next.routingClass, fallbackUsed: true, fallbackReason: reason });
    }) : dependencies.execute;
    if (!execute) throw new DirectorError("INTERNAL_ERROR", "Configuration des fournisseurs IA incomplète.");
    const tools = createDirectorTools(dependencies.registry, {
      ...user, agentId, agentRunId: runId, correlationId,
    }, dependencies.store, controller.signal, () => {
      if (terminalStatus) throw new DirectorError("CANCELLED", "Demande terminée.");
      if (toolCallCount >= DIRECTOR_CONFIG.maxToolCalls) abortBudget();
      toolCallCount++;
    }, (operation) => {
      activeTools.add(operation);
      void operation.then(() => activeTools.delete(operation), () => activeTools.delete(operation));
    });
    // Race guarantees a response deadline even if an SDK/provider ignores cancellation.
    const aborted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(controller.signal.reason);
      else controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
    const text = redactText(await Promise.race([
      execute({
        runId, message: objective, model, tools, signal: controller.signal,
        onUsage: (inputs, outputs, iterations) => {
          if (terminalStatus) return;
          inputTokens = inputs; outputTokens = outputs; iterationCount = iterations;
          if (inputs + outputs > DIRECTOR_CONFIG.maxTotalTokens) abortBudget();
          if (iterations > DIRECTOR_CONFIG.maxIterations) abortBudget();
        },
      }), aborted,
    ]));
    if (!text.trim()) throw new DirectorError("MODEL_ERROR", "L’assistant n’a pas fourni de réponse. Réessayez.");
    terminalStatus = "completed";
    await Promise.allSettled([...activeTools]);
    await dependencies.store.finishRun(user.organizationId, runId, {
      status: "completed", completedAt: new Date(), iterationCount, toolCallCount,
      inputTokens, outputTokens, finalOutput: { text },
      ...(selection ? { provider: selection.provider, modelName: selection.model, modelProfile: selection.modelProfile, routingClass: selection.routingClass, fallbackUsed: !!fallbackReason, fallbackReason } : {}),
    });
    return { runId, text, ...(selection ? { provider: selection.provider, model: selection.model, fallbackUsed: !!fallbackReason } : {}) };
  } catch (error: unknown) {
    const safe = error instanceof DirectorError ? error : new DirectorError("MODEL_ERROR", "L’assistant est temporairement indisponible. Le CRM reste accessible.");
    if (!controller.signal.aborted) controller.abort(safe);
    // Finalize in-flight tool records before the web boundary releases its DB client.
    await Promise.allSettled([...activeTools]);
    terminalStatus = safe.code === "TIMEOUT" ? "timeout" : safe.code === "CANCELLED" ? "cancelled" : safe.code === "BUDGET_EXCEEDED" ? "budget_exceeded" : "failed";
    await dependencies.store.finishRun(user.organizationId, runId, {
      status: terminalStatus, completedAt: new Date(), iterationCount, toolCallCount,
      inputTokens, outputTokens, errorCode: safe.code, errorMessage: safe.message,
      ...(selection ? { provider: selection.provider, modelName: selection.model, modelProfile: selection.modelProfile, routingClass: selection.routingClass, fallbackUsed: !!fallbackReason, fallbackReason } : {}),
    });
    throw safe;
  } finally {
    clearTimeout(timeout);
    dependencies.signal?.removeEventListener("abort", cancel);
  }
}
