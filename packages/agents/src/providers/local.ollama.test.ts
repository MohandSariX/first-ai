import { expect, it } from "vitest";
import { z } from "zod";
import { ollamaBaseUrlSchema } from "@first-ai/schemas";
import { OllamaProvider } from "./ollama.js";

it("checks local model health and one tiny read-only tool exchange", async () => {
  const baseUrl = ollamaBaseUrlSchema.parse(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  const model = process.env.OLLAMA_MODEL_STANDARD || "qwen3:4b-instruct";
  const provider = new OllamaProvider(baseUrl);
  expect((await provider.health(model)).status).toBe("available");
  let toolSucceeded = false; let inputTokens = 0; let outputTokens = 0; let turns = 0;
  const start = performance.now();
  const response = await provider.execute({ model, message: "Combien ai-je de clients actifs ? Utilise customers_countActive. Réponds en une phrase.",
    signal: AbortSignal.timeout(38_000), maxIterations: 2,
    tools: [{ name: "customers_countActive", description: "Compte les clients actifs de la fixture fictive locale.", parameters: z.strictObject({}),
      invoke: async () => { toolSucceeded = true; return JSON.stringify({ success: true, data: { count: 2 } }); } }],
    onUsage: (inputs, outputs, iterations) => { inputTokens = inputs; outputTokens = outputs; turns = iterations; },
  });
  console.log(JSON.stringify({ event: "local_ollama_test", model, durationMs: Math.round(performance.now() - start), toolSucceeded, inputTokens, outputTokens, turns }));
  expect(toolSucceeded).toBe(true); expect(response).toContain("2");
});
