import { AiSettingsService, DirectorError, OllamaProvider, OpenAIProvider, runDirector } from "@first-ai/agents/server";
import { AgentObservabilityRepository, AiSettingsRepository } from "@first-ai/database";
import { directorChatInputSchema } from "@first-ai/schemas";
import { createCrmSummaryTools, createCrmToolRegistry } from "@first-ai/tools";
import { NextResponse } from "next/server";

import { getBusinessUser } from "../../../lib/auth";
import { createCrm } from "../../../lib/crm";

export const runtime = "nodejs";
export const maxDuration = 90;
const failure = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  // Cookie-authenticated POST: refuse cross-origin requests before any paid run.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try { sameOrigin = origin !== null && new URL(origin).host === request.headers.get("host") && new URL(origin).protocol === new URL(request.url).protocol; }
  catch { sameOrigin = false; }
  if (!sameOrigin) {
    return failure("FORBIDDEN", "Origine de la demande non autorisée.", 403);
  }
  const user = await getBusinessUser();
  if (user === null) return failure("UNAUTHORIZED", "Connectez-vous pour utiliser l’assistant.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 12000) return failure("VALIDATION_ERROR", "Votre message est trop long.", 400);
  let parsed;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("VALIDATION_ERROR", "Message invalide.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 12000) {
        await reader.cancel();
        return failure("VALIDATION_ERROR", "Votre message est trop long.", 400);
      }
      chunks.push(chunk.value);
    }
    parsed = directorChatInputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  }
  catch { return failure("VALIDATION_ERROR", "Message invalide.", 400); }
  if (!parsed.success) return failure("VALIDATION_ERROR", "Saisissez un message entre 1 et 2 000 caractères.", 400);
  let crm: Awaited<ReturnType<typeof createCrm>> | undefined;
  try {
    crm = await createCrm(user);
    const registry = { ...createCrmToolRegistry(crm), ...createCrmSummaryTools(crm.dashboard, crm.leadSummary) };
    const settings = await new AiSettingsService(new AiSettingsRepository(crm.database)).get(user);
    const result = await runDirector(parsed.data, user, {
      registry, store: new AgentObservabilityRepository(crm.database),
      signal: request.signal,
      settings, providers: { ollama: new OllamaProvider(settings.ollamaBaseUrl), openai: new OpenAIProvider() },
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof DirectorError) {
      return failure(error.code, error.message, error.code === "FORBIDDEN" ? 403 : error.code === "TIMEOUT" ? 504 : error.code === "BUDGET_EXCEEDED" ? 429 : 503);
    }
    // Do not log provider errors, prompts, credentials or raw database exceptions.
    console.error(JSON.stringify({ event: "assistant_failure", organizationId: user.organizationId, userId: user.userId }));
    return failure("INTERNAL_ERROR", "L’assistant est indisponible. Le CRM reste accessible.", 503);
  } finally {
    await crm?.database.$client.end();
  }
}
