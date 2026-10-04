import { z } from "zod";

// No browser-provided scope or trusted history is accepted in v1.
export const directorChatInputSchema = z.strictObject({
  message: z.string().trim().min(1).max(2000),
});
export const directorChatResponseSchema = z.object({
  runId: z.uuid(),
  text: z.string().min(1).max(12000),
  provider: z.enum(["ollama", "openai"]).optional(),
  model: z.string().max(120).optional(),
  fallbackUsed: z.boolean().optional(),
});
