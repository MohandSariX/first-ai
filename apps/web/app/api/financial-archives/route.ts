import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { financialRetentionPolicySchema, financialArchivePeriodSchema } from "@first-ai/schemas";
import { AuthorizationError, OperationalConflictError, ResourceNotFoundError } from "@first-ai/tools";
import { withCrm } from "../../../lib/crm";
import { getBusinessUser } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/request-security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.discriminatedUnion("action", [z.strictObject({ action: z.literal("configure"), policy: financialRetentionPolicySchema }), z.strictObject({ action: z.literal("export"), period: financialArchivePeriodSchema }), z.strictObject({ action: z.literal("verify"), id: z.uuid() })]);
function failure(e: unknown) {
  const status = e instanceof AuthorizationError ? 403 : e instanceof ResourceNotFoundError ? 404 : e instanceof z.ZodError || e instanceof SyntaxError ? 400 : e instanceof OperationalConflictError ? 409 : 503;
  return NextResponse.json({ error: { message: e instanceof OperationalConflictError ? e.message : status === 400 ? "Vérifiez les champs de configuration ou la période." : status === 403 ? "Action non autorisée ou adhésion inactive." : "Archive indisponible." } }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  if (!await getBusinessUser()) return NextResponse.json({ error: { message: "Connectez-vous avec une adhésion active." } }, { status: 401 });
  if (!hasSameOrigin(request)) return failure(new AuthorizationError("Origine invalide."));
  try {
    const reader = request.body?.getReader(); if (!reader) return failure(new SyntaxError("Missing body"));
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); return NextResponse.json({ error: { message: "Requête trop volumineuse." } }, { status: 413 }); }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const i = inputSchema.parse(JSON.parse(text));
    const result = await withCrm(async c => i.action === "configure" ? (await c.retention.configure(c.context, i.policy), { success: true }) : i.action === "export" ? await c.retention.createExport(c.context, i.period) : await c.retention.verifyExport(c.context, i.id));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}
export async function GET(request: Request) {
  if (!await getBusinessUser()) return NextResponse.json({ error: { message: "Connectez-vous." } }, { status: 401 });
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const bytes = await withCrm(c => c.retention.downloadExport(c.context, id));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="archive-financiere-${id}.json"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return failure(e); }
}
