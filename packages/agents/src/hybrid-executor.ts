import type { AiSettings } from "@first-ai/schemas";
import { DIRECTOR_CONFIG } from "./director/config.js";
import { HybridModelRouter, type ModelSelection } from "./hybrid-router.js";
import { DirectorError, type DirectorExecutor } from "./types.js";
import type { AiProvider } from "./providers/provider.js";

const fallbackCodes = new Set(["OLLAMA_UNAVAILABLE", "OLLAMA_MODEL_MISSING", "OLLAMA_TIMEOUT", "OLLAMA_INVALID_RESPONSE"]);
export function createHybridExecutor(settings: AiSettings, initial: ModelSelection, providers: Record<"ollama" | "openai", AiProvider>, onSelection: (selection: ModelSelection, fallbackReason?: string) => Promise<void>): DirectorExecutor {
  return async (input) => {
    let inputs = 0, outputs = 0, iterations = 0;
    async function attempt(selection: ModelSelection) {
      const baseline = { inputs, outputs, iterations };
      if (iterations >= DIRECTOR_CONFIG.maxIterations) throw new DirectorError("BUDGET_EXCEEDED", "La limite de cette demande a été atteinte.");
      input.signal.throwIfAborted();
      return providers[selection.provider].execute({ ...input, model: selection.model,
        maxIterations: DIRECTOR_CONFIG.maxIterations - iterations,
        onUsage: (i, o, turns) => {
          inputs = baseline.inputs + i; outputs = baseline.outputs + o; iterations = baseline.iterations + turns;
          input.onUsage(inputs, outputs, iterations);
        },
      });
    }
    try { return await attempt(initial); }
    catch (error: unknown) {
      input.signal.throwIfAborted();
      if (settings.mode !== "HYBRID" || !settings.fallbackEnabled || initial.provider !== "ollama" || !(error instanceof DirectorError) || !fallbackCodes.has(error.code)) throw error;
      const cloud = new HybridModelRouter().cloud(settings, initial.routingClass);
      await onSelection(cloud, error.code);
      return attempt(cloud);
    }
  };
}
