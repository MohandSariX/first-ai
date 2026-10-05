import { randomUUID } from "node:crypto";
import { hasPermission } from "@first-ai/auth";
import type { Tool } from "@first-ai/tools";
import { z } from "zod";

import { sanitizeData } from "../sanitize.js";
import { DirectorError, type DirectorContext, type DirectorTool, type RunStore } from "../types.js";
import { DIRECTOR_CONFIG } from "./config.js";

export const DIRECTOR_TOOL_ALLOWLIST = [
  "customers.get", "customers.search", "contacts.get", "contacts.search",
  "sites.get", "sites.search", "leads.get", "leads.search",
  "services.get", "services.search", "services.listActive",
  "customers.countActive", "leads.countOpen", "leads.countNew",
  "leads.recentNew", "services.countActive",
  "quotes.get", "quotes.search", "jobs.get", "jobs.search", "jobs.getToday", "jobReports.get",
] as const;

// Strict function schemas require nullable optional fields, without Zod defaults.
// The existing First AI schema remains authoritative after normalization.
function sdkParameters(schema: z.ZodType): z.ZodObject<z.ZodRawShape> {
  if (!(schema instanceof z.ZodObject)) throw new Error("Director tools require object schemas.");
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    let inner = field;
    while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodType;
    shape[key] = field.isOptional() ? inner.nullable() : inner;
  }
  if ("limit" in shape) shape.limit = z.number().int().min(1).max(20).nullable();
  if ("offset" in shape) shape.offset = z.number().int().min(0).max(10000).nullable();
  return z.strictObject(shape);
}
const safeError = (code: string) => ({
  success: false, error: { code, message: code === "FORBIDDEN" ? "Accès non autorisé." : code === "NOT_FOUND" ? "Ressource introuvable." : "Lecture des données impossible." },
});
function toolOutput(value: unknown): { data: unknown; text: string } {
  const sanitized = sanitizeData(value);
  const text = JSON.stringify(sanitized);
  if (text.length <= DIRECTOR_CONFIG.maxResultCharacters) return { data: sanitized, text };
  const data = { truncated: true, untrustedDataPreview: text.slice(0, Math.floor((DIRECTOR_CONFIG.maxResultCharacters - 200) / 2)) };
  return { data, text: JSON.stringify(data) };
}

export function createDirectorTools(
  registry: Readonly<Record<string, Tool>>,
  context: DirectorContext,
  store: RunStore,
  signal: AbortSignal,
  beforeCall: () => void,
  track: (operation: Promise<unknown>) => void = () => undefined,
): DirectorTool[] {
  const trusted = Object.freeze({ ...context });
  return DIRECTOR_TOOL_ALLOWLIST.flatMap((name) => {
    const candidate = registry[name];
    if (!candidate) throw new Error(`Missing Director tool: ${name}`);
    const definition: Tool = candidate;
    if (definition.name !== name || definition.risk !== 0 || !definition.permission.endsWith(".read")) {
      throw new Error(`Unsafe Director tool registration: ${name}`);
    }
    if (!hasPermission(trusted.role, definition.permission)) return [];
    const parameters = sdkParameters(definition.inputSchema);
    return [{
      name: name.replaceAll(".", "_"), description: definition.description, parameters,
      invoke(input: unknown) {
        const operation = invoke(input);
        track(operation);
        return operation;
      },
      rejectInput(input: unknown) {
        const operation = invoke(input, true);
        track(operation);
        return operation;
      },
    }];
    async function invoke(input: unknown, invalidInput = false) {
        signal.throwIfAborted();
        const callId = randomUUID();
        await store.startToolCall({
          id: callId, organizationId: trusted.organizationId, agentId: trusted.agentId,
          agentRunId: trusted.agentRunId, toolName: name, riskLevel: 0,
          input: sanitizeData(input), status: "running", startedAt: new Date(),
        });
        try {
          beforeCall();
          if (invalidInput) throw new DirectorError("VALIDATION_ERROR", "Arguments invalides.");
          // Even direct invocation (outside SDK parsing) rejects scope injection.
          const parsed = parameters.parse(input);
          const normalized: Record<string, unknown> = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null));
          if ("limit" in parameters.shape) normalized.limit ??= 20;
          if ("offset" in parameters.shape) normalized.offset ??= 0;
          signal.throwIfAborted();
          let abort: () => void = () => undefined;
          const cancelled = new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
          });
          const result = await Promise.race([definition.execute(trusted, normalized), cancelled])
            .finally(() => signal.removeEventListener("abort", abort));
          signal.throwIfAborted();
          const output = toolOutput(result.success ? result : safeError(result.error.code));
          await store.finishToolCall(trusted.organizationId, callId, {
            status: result.success ? "completed" : "failed", output: output.data,
            completedAt: new Date(), ...(!result.success ? { errorCode: result.error.code, errorMessage: "Lecture des données impossible." } : {}),
          });
          return output.text;
        } catch (error: unknown) {
          const code = error instanceof DirectorError ? error.code : signal.aborted ? "CANCELLED" : error instanceof z.ZodError ? "VALIDATION_ERROR" : "TOOL_ERROR";
          await store.finishToolCall(trusted.organizationId, callId, {
            status: code === "BUDGET_EXCEEDED" ? "blocked" : signal.aborted ? "cancelled" : "failed", completedAt: new Date(),
            errorCode: code, errorMessage: "Lecture des données impossible.",
          });
          if (signal.aborted || (error instanceof DirectorError && error.code !== "VALIDATION_ERROR")) throw error;
          return JSON.stringify(safeError(code));
        }
      }
  });
}
