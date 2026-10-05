import { expect, it } from "vitest";
import { z } from "zod";
import { ollamaBaseUrlSchema } from "@first-ai/schemas";
import { OllamaProvider } from "./ollama.js";
import { SPECIALISTS } from "../specialists.js";
import { calculateQuoteTotals } from "@first-ai/tools";

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

it("checks one tiny local Pricing read using deterministic totals, without writes",async()=>{
  const provider=new OllamaProvider(ollamaBaseUrlSchema.parse(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"));
  const model=process.env.OLLAMA_MODEL_STANDARD || "qwen3:4b-instruct";
  expect((await provider.health(model)).status).toBe("available");
  let toolSucceeded=false,inputTokens=0,outputTokens=0; const start=performance.now();
  const quoteId="00000000-0000-4000-8000-000000000001";
  const text=await provider.execute({agentName:"pricing:v1",instructions:SPECIALISTS.pricing.instructions,model,message:`Pour le devis fictif ${quoteId}, utilise quotes_calculateTotals. Réponds uniquement avec le sous-total HT en euros.`,signal:AbortSignal.timeout(38_000),maxIterations:2,
    tools:[{name:"quotes_calculateTotals",description:"Totaux exacts du devis fictif, lecture seule.",parameters:z.strictObject({quoteId:z.uuid()}),invoke:async input=>{expect(input).toEqual({quoteId});toolSucceeded=true;return JSON.stringify({success:true,data:calculateQuoteTotals([{quantity:"2",unitPrice:"100.10",taxRate:"20",costEstimate:"30"}])});}}],
    onUsage:(i,o)=>{inputTokens=i;outputTokens=o;},
  });
  console.log(JSON.stringify({event:"local_pricing_smoke",model,durationMs:Math.round(performance.now()-start),toolSucceeded,inputTokens,outputTokens}));expect(toolSucceeded).toBe(true);expect(text.replace(",",".")).toContain("200.20");
});
