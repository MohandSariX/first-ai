import "server-only";
import { createDatabaseClient, CreditNoteStore } from "@first-ai/database";
import { CreditNoteService, AuthorizationError, ResourceNotFoundError, OperationalConflictError } from "@first-ai/tools";
import { generateCreditNotePdf } from "@first-ai/tools/credit-note-pdf";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUser } from "../../../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getBusinessUser();
  const error = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!user) return error("UNAUTHORIZED", "Connectez-vous avec une adhésion active.", 401);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return error("NOT_FOUND", "Avoir introuvable.", 404);
  const db = createDatabaseClient();
  try {
    const snapshot = await new CreditNoteService(new CreditNoteStore(db)).getDocument(user, id);
    const bytes = await generateCreditNotePdf(snapshot);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${snapshot.number}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof AuthorizationError) return error("FORBIDDEN", "Votre rôle ne permet pas de consulter les avoirs.", 403);
    if (e instanceof ResourceNotFoundError) return error("NOT_FOUND", "Avoir introuvable.", 404);
    if (e instanceof OperationalConflictError) return error("CONFLICT", e.message, 409);
    return error("INTERNAL_ERROR", "Le document est temporairement indisponible.", 503);
  } finally { await db.$client.end(); }
}
