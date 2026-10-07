import "server-only";
import { createDatabaseClient, InvoiceStore } from "@first-ai/database";
import { InvoiceService, FinancialRetentionService, AuthorizationError, ResourceNotFoundError, OperationalConflictError } from "@first-ai/tools";
import { generateInvoicePdf } from "@first-ai/tools/invoice-pdf";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessUser } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getBusinessUser();
  const error = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!user) return error("UNAUTHORIZED", "Connectez-vous avec une adhésion active.", 401);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return error("NOT_FOUND", "Facture introuvable.", 404);
  const db = createDatabaseClient();
  try {
    const view = await new InvoiceService(new InvoiceStore(db)).getInvoiceDocument(user, id);
    const current = new URL(request.url).searchParams.get("copy") === "current";
    const original = current ? undefined : await new FinancialRetentionService(new InvoiceStore(db)).original(user, "invoice", id);
    const bytes = original?.bytes ?? await generateInvoicePdf(view);
    // The strict snapshot schema constrains the number; no user-controlled path/header.
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${view.snapshot.invoice.number}${original ? "" : "-copie-actualisee"}.pdf"`, "X-First-AI-Document": original ? "original-issued" : "reconstructed-current-copy", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof AuthorizationError) return error("FORBIDDEN", "Votre rôle ne permet pas de consulter les factures.", 403);
    if (e instanceof ResourceNotFoundError) return error("NOT_FOUND", "Facture introuvable.", 404);
    if (e instanceof OperationalConflictError) return error("CONFLICT", e.message, 409);
    return error("INTERNAL_ERROR", "Le document est temporairement indisponible.", 503);
  } finally { await db.$client.end(); }
}
