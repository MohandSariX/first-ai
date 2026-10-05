import { ollamaBaseUrlSchema } from "@first-ai/schemas";
import { z } from "zod";
import { DIRECTOR_CONFIG } from "../director/config.js";
import { currentDirectorInstructions } from "../director/instructions.js";
import { DirectorError, type DirectorExecution } from "../types.js";
import type { AiProvider } from "./provider.js";

const modelsSchema = z.object({ models: z.array(z.object({ name: z.string().min(1).max(120) })).max(200) });
const callSchema = z.object({ function: z.object({ name: z.string().max(120), arguments: z.record(z.string(), z.unknown()) }) });
const responseSchema = z.object({ message: z.object({ role: z.literal("assistant"), content: z.string().max(12000), tool_calls: z.array(callSchema).max(12).optional() }),
  done: z.literal(true), prompt_eval_count: z.number().int().nonnegative().optional(), eval_count: z.number().int().nonnegative().optional() });
type Message = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_name?: string; tool_calls?: z.infer<typeof callSchema>[] };
// Shared across adapter instances/HMR in this Node process. No distributed scheduler.
const localState = globalThis as typeof globalThis & { firstAiOllamaBusy?: boolean };
export class OllamaProvider implements AiProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = ollamaBaseUrlSchema.parse(baseUrl).replace(/\/$/, "");
  }
  private async request(path: "/api/tags" | "/api/chat", init: RequestInit, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal, redirect: "error", cache: "no-store" });
      if (!response.ok) throw new DirectorError(response.status === 404 ? "OLLAMA_MODEL_MISSING" : "OLLAMA_UNAVAILABLE", "Ollama indisponible ou modèle absent.");
      const reader = response.body?.getReader();
      if (!reader) throw new DirectorError("OLLAMA_INVALID_RESPONSE", "Réponse locale invalide.");
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 262144) { await reader.cancel(); throw new DirectorError("OLLAMA_INVALID_RESPONSE", "Réponse locale trop volumineuse."); }
        chunks.push(chunk.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error: unknown) {
      if (error instanceof DirectorError) throw error;
      if (signal.aborted) throw signal.reason;
      throw new DirectorError(error instanceof SyntaxError ? "OLLAMA_INVALID_RESPONSE" : "OLLAMA_UNAVAILABLE", "Ollama indisponible. Vérifiez le service local.");
    }
  }
  async discover(signal?: AbortSignal): Promise<{ status: "available" | "unavailable"; models: string[] }> {
    try {
      const result = modelsSchema.parse(await this.request("/api/tags", { method: "GET" }, signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000)));
      return { status: "available", models: result.models.map((model) => model.name) };
    } catch { return { status: "unavailable", models: [] }; }
  }
  async health(model: string) {
    const discovery = await this.discover();
    return { ...discovery, status: discovery.status === "unavailable" ? "unavailable" as const : discovery.models.includes(model) ? "available" as const : "model_missing" as const };
  }
  async execute(input: DirectorExecution): Promise<string> {
    if (localState.firstAiOllamaBusy) throw new DirectorError("OLLAMA_BUSY", "Le modèle local est occupé. Réessayez dans un instant.");
    localState.firstAiOllamaBusy = true;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DirectorError("OLLAMA_TIMEOUT", "Le modèle local a dépassé le délai autorisé.")), 35_000);
    const signal = AbortSignal.any([input.signal, timeout.signal]);
    try {
      const discovery = await this.discover(signal);
      signal.throwIfAborted();
      if (discovery.status !== "available") throw new DirectorError("OLLAMA_UNAVAILABLE", "Ollama indisponible.");
      if (!discovery.models.includes(input.model)) throw new DirectorError("OLLAMA_MODEL_MISSING", "Le modèle local sélectionné n’est pas installé.");
      const messages: Message[] = [{ role: "system", content: currentDirectorInstructions() }, { role: "user", content: input.message }];
      const tools = input.tools.map((entry) => ({ type: "function", function: { name: entry.name, description: entry.description, parameters: z.toJSONSchema(entry.parameters) } }));
      let inputs = 0, outputs = 0;
      for (let turn = 1; turn <= (input.maxIterations ?? DIRECTOR_CONFIG.maxIterations); turn++) {
        signal.throwIfAborted();
        // Bound accumulated context without silently dropping facts or tool-message pairs.
        if (JSON.stringify(messages).length > 16000) throw new DirectorError("BUDGET_EXCEEDED", "Précisez votre question pour limiter le contexte local.");
        input.onUsage(inputs, outputs, turn);
        const parsed = responseSchema.safeParse(await this.request("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: input.model, messages, tools, stream: false, think: false,
            keep_alive: "30s", options: { num_ctx: 8192, num_predict: 512, temperature: 0 } }),
        }, signal));
        if (!parsed.success) throw new DirectorError("OLLAMA_INVALID_RESPONSE", "Le modèle local a produit une réponse invalide.");
        const result = parsed.data;
        inputs += result.prompt_eval_count ?? 0; outputs += result.eval_count ?? 0;
        input.onUsage(inputs, outputs, turn);
        const calls = result.message.tool_calls ?? [];
        if (!calls.length) {
          if (!result.message.content.trim()) throw new DirectorError("OLLAMA_INVALID_RESPONSE", "Le modèle local n’a pas fourni de réponse.");
          return result.message.content;
        }
        messages.push(result.message);
        for (const call of calls) {
          const definition = input.tools.find((entry) => entry.name === call.function.name);
          if (!definition || !definition.parameters.safeParse(call.function.arguments).success) {
            if (definition?.rejectInput) await definition.rejectInput(call.function.arguments);
            throw new DirectorError("OLLAMA_INVALID_RESPONSE", "Appel d’outil local invalide.");
          }
          signal.throwIfAborted();
          const output = await definition.invoke(call.function.arguments);
          // Keep valid JSON and explicitly mark truncated untrusted data previews.
          const content = output.length <= 2500 ? output : JSON.stringify({ truncated: true, untrustedDataPreview: output.slice(0, 1800) });
          messages.push({ role: "tool", tool_name: definition.name, content });
        }
      }
      throw new DirectorError("BUDGET_EXCEEDED", "La limite de cette demande a été atteinte.");
    } finally { clearTimeout(timer); localState.firstAiOllamaBusy = false; }
  }
}
