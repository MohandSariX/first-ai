import type { InvoiceSession } from "@first-ai/database";
import { financialRetentionDeadline, type CreditNoteSnapshot, type InvoiceDocumentSnapshot } from "@first-ai/schemas";
import { generateInvoicePdf } from "./invoice-pdf.js";
import { generateCreditNotePdf } from "./credit-note-pdf.js";
import { LocalFinancialStorage, financialHash, financialStorageKey, type FinancialArtifactStorage } from "./financial-storage.js";
import { OperationalConflictError } from "./operational-policies.js";
export const FINANCIAL_RENDERER_VERSION = "pdfkit-0.20.2/first-ai-original-v2-noto";
export async function persistIssuedArtifact(s: InvoiceSession, snapshot: InvoiceDocumentSnapshot | CreditNoteSnapshot, storage: FinancialArtifactStorage = new LocalFinancialStorage()) {
  const invoice = "invoiceId" in snapshot, kind = invoice ? "invoice" : "credit_note", id = invoice ? snapshot.invoiceId : snapshot.creditNoteId;
  const number = invoice ? snapshot.invoice.number : snapshot.number, issueDate = invoice ? snapshot.invoice.issueDate : snapshot.issueDate;
  const generatedAt = new Date(invoice ? snapshot.capturedAt : snapshot.issuedAt);
  const org = snapshot.organizationId;
  const bytes = invoice ? await generateInvoicePdf({ snapshot, payment: { status: "issued", amountPaid: "0.00", amountDue: snapshot.totals.total, asOf: snapshot.capturedAt } }, { original: true }) : await generateCreditNotePdf(snapshot);
  const sha256 = financialHash(bytes), existing = await s.retention.artifact(org, kind, id);
  if (existing) {
    if (existing.sha256 !== sha256 || existing.byteSize !== bytes.length) {
      console.error(JSON.stringify({ event: "financial_original_conflict", organizationId: org, entityType: kind, entityId: id }));
      throw new OperationalConflictError("L’original existe avec une autre empreinte ; aucune réécriture autorisée.");
    }
    await storage.read(org, existing.storageKey, existing.sha256, existing.byteSize); return existing;
  }
  const policyRow = await s.retention.policy(org);
  const policy = policyRow ? { closingMonth: policyRow.closingMonth, closingDay: policyRow.closingDay, retentionYears: policyRow.retentionYears, version: policyRow.version } : null;
  const deadline = financialRetentionDeadline(issueDate, policy);
  const storageKey = financialStorageKey(org, kind, id, sha256);
  // File published before commit, metadata + issue atomic in PostgreSQL. Failed transaction
  // can leave an unreachable content-addressed orphan, never a false original/number.
  await storage.put(org, storageKey, bytes);
  const artifact = await s.retention.addArtifact({ organizationId: org, entityType: kind, entityId: id, documentNumber: number, generatedAt, sha256, byteSize: bytes.length, rendererVersion: FINANCIAL_RENDERER_VERSION, storageKey, policy, ...deadline });
  if (!artifact) throw new Error("Artifact metadata was not persisted.");
  return artifact;
}
