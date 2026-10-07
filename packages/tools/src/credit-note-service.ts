import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { CreditNoteScope, CreditNoteSession, CreditNoteStoreInterface, Invoice } from "@first-ai/database";
import { createCreditNoteSchema, creditNoteItemInputSchema, creditNoteSnapshotSchema, invoiceDocumentSnapshotSchema, searchCreditNotesSchema } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";
import { calculateCreditLines } from "./credit-note-calculation.js";
import { deriveCorrectedBalance, financialCents, financialMoney } from "./invoice-balance.js";
function found<T>(row: T | undefined): T { if (!row) throw new ResourceNotFoundError("Facture ou avoir introuvable."); return row; }
function authorize(c: CurrentBusinessUser, permission: Permission) { if (!hasPermission(c.role, permission)) throw new AuthorizationError("Action non autorisée."); }
const scope = (c: CurrentBusinessUser, id: string): CreditNoteScope => ({ organizationId: c.organizationId, creditNoteId: z.uuid().parse(id) });
function originalDocument(invoice: Invoice) {
  if (!invoice.issuedAt || !["issued", "sent", "overdue", "partially_paid", "paid"].includes(invoice.status) || !invoice.documentSnapshot) throw new OperationalConflictError("Une facture émise avec son document original est requise. Aucun historique ne sera inventé.");
  const original = invoiceDocumentSnapshotSchema.parse(invoice.documentSnapshot);
  if (original.invoiceId !== invoice.id || original.organizationId !== invoice.organizationId) throw new OperationalConflictError("Document original incohérent.");
  for (const [lineKey, totalKey] of [["subtotal", "subtotal"], ["taxAmount", "taxAmount"], ["total", "total"]] as const) {
    if (original.lines.reduce((n, l) => n + financialCents(l[lineKey]), 0n) !== financialCents(original.totals[totalKey])) throw new OperationalConflictError("Totaux du document original incohérents.");
  }
  if (original.lines.some(l => financialCents(l.total) !== financialCents(l.subtotal) + financialCents(l.taxAmount))) throw new OperationalConflictError("Lignes du document original incohérentes.");
  return original;
}
export class CreditNoteService {
  constructor(private readonly store: CreditNoteStoreInterface) {}
  private async member(s: CreditNoteSession, c: CurrentBusinessUser, permission: Permission) { authorize(c, permission); const m = await s.membership(c); if (!m) throw new AuthorizationError("Adhésion inactive."); authorize({ ...c, role: m.role }, permission); }
  async searchCreditNotes(c: CurrentBusinessUser, input: unknown = {}) {
    const parsed = searchCreditNotesSchema.parse(input); return this.store.transaction(async s => { await this.member(s, c, "creditNotes.read"); return s.creditNotes.search({ ...parsed, organizationId: c.organizationId }); });
  }
  async getCreditNote(c: CurrentBusinessUser, id: string) {
    return this.store.transaction(async s => { await this.member(s, c, "creditNotes.read"); const sc = scope(c, id), note = found(await s.creditNotes.get(sc)), invoice = found(await s.invoices.get({ organizationId: c.organizationId, invoiceId: note.originalInvoiceId })); return { ...note, items: await s.creditNotes.items(sc), original: originalDocument(invoice) }; });
  }
  async createDraft(c: CurrentBusinessUser, input: unknown) {
    const parsed = createCreditNoteSchema.parse(input);
    return this.store.transaction(async s => {
      await this.member(s, c, "creditNotes.write");
      const sc = { organizationId: c.organizationId, invoiceId: parsed.originalInvoiceId }, invoice = found(await s.invoices.get(sc, true)), original = originalDocument(invoice);
      const existing = await s.creditNotes.byKey(c.organizationId, parsed.idempotencyKey);
      if (existing) { if (existing.originalInvoiceId !== parsed.originalInvoiceId || existing.reason !== parsed.reason || existing.correctionType !== parsed.correctionType) throw new OperationalConflictError("Clé de brouillon réutilisée avec une autre demande."); return existing; }
      const prior = await s.creditNotes.correctedLines(sc);
      if (financialCents(await s.creditNotes.summary(sc)) >= financialCents(invoice.total)) throw new OperationalConflictError("Facture déjà entièrement corrigée.");
      const note = found(await s.creditNotes.create({ ...parsed, organizationId: c.organizationId, createdByUserId: c.userId }));
      if (parsed.correctionType === "full") {
        const requested = original.lines.flatMap((line, originalLineIndex) => { const remaining = financialCents(line.subtotal) - financialCents(prior.find(p => p.originalLineIndex === originalLineIndex)?.subtotal ?? "0"); return remaining > 0n ? [{ originalLineIndex, subtotal: financialMoney(remaining) }] : []; });
        const result = calculateCreditLines(original, requested, prior, true), ns = scope(c, note.id);
        for (const line of result.lines) await s.creditNotes.setItem(ns, invoice.id, line.originalLineIndex, line.subtotal, line.taxAmount, line.total);
        return found(await s.creditNotes.update(ns, result.totals));
      }
      return note;
    });
  }
  private async locked(s: CreditNoteSession, c: CurrentBusinessUser, sc: CreditNoteScope) {
    const initial = found(await s.creditNotes.get(sc));
    // Same parent-first lock order as payments; serializes all corrections to one invoice.
    const invoice = found(await s.invoices.get({ organizationId: c.organizationId, invoiceId: initial.originalInvoiceId }, true));
    const note = found(await s.creditNotes.get(sc, true)); return { invoice, note };
  }
  async setItem(c: CurrentBusinessUser, id: string, input: unknown) {
    const parsed = creditNoteItemInputSchema.parse(input), sc = scope(c, id);
    return this.store.transaction(async s => {
      await this.member(s, c, "creditNotes.write"); const { invoice, note } = await this.locked(s, c, sc);
      if (note.status !== "draft" || note.correctionType !== "partial") throw new OperationalConflictError("Seul un avoir partiel brouillon est éditable.");
      const items = await s.creditNotes.items(sc), requested = [...items.filter(i => i.originalLineIndex !== parsed.originalLineIndex), parsed];
      const result = calculateCreditLines(originalDocument(invoice), requested, await s.creditNotes.correctedLines({ organizationId: c.organizationId, invoiceId: invoice.id }));
      for (const line of result.lines) await s.creditNotes.setItem(sc, invoice.id, line.originalLineIndex, line.subtotal, line.taxAmount, line.total);
      return found(await s.creditNotes.update(sc, result.totals));
    });
  }
  async removeItem(c: CurrentBusinessUser, id: string, originalLineIndex: number) {
    creditNoteItemInputSchema.shape.originalLineIndex.parse(originalLineIndex); const sc = scope(c, id);
    return this.store.transaction(async s => { await this.member(s, c, "creditNotes.write"); const { invoice, note } = await this.locked(s, c, sc); if (note.status !== "draft" || note.correctionType !== "partial") throw new OperationalConflictError("Brouillon partiel requis."); await s.creditNotes.removeItem(sc, originalLineIndex); const items = await s.creditNotes.items(sc); const totals = items.length ? calculateCreditLines(originalDocument(invoice), items, await s.creditNotes.correctedLines({ organizationId: c.organizationId, invoiceId: invoice.id })).totals : { subtotal: "0.00", taxAmount: "0.00", total: "0.00" }; return found(await s.creditNotes.update(sc, totals)); });
  }
  async issue(c: CurrentBusinessUser, id: string) {
    const sc = scope(c, id);
    return this.store.transaction(async s => {
      await this.member(s, c, "creditNotes.issue"); const { invoice, note } = await this.locked(s, c, sc);
      if (note.status === "issued") return note;
      if (note.status !== "draft") throw new OperationalConflictError("Avoir annulé non émissible.");
      const is = { organizationId: c.organizationId, invoiceId: invoice.id }, original = originalDocument(invoice);
      const result = calculateCreditLines(original, await s.creditNotes.items(sc), await s.creditNotes.correctedLines(is), note.correctionType === "full");
      const allocation = await s.creditNotes.allocate(sc);
      const snapshot = creditNoteSnapshotSchema.parse({ version: 1, organizationId: c.organizationId, creditNoteId: id, ...allocation, issuedAt: allocation.issuedAt.toISOString(), originalInvoice: original, reason: note.reason, correctionType: note.correctionType, ...result });
      for (const line of result.lines) await s.creditNotes.setItem(sc, invoice.id, line.originalLineIndex, line.subtotal, line.taxAmount, line.total);
      const issued = found(await s.creditNotes.update(sc, { ...result.totals, number: allocation.number, issueDate: allocation.issueDate, issuedAt: allocation.issuedAt, status: "issued", snapshot }));
      const receipts = await s.payments.summary(is), credited = await s.creditNotes.summary(is), balance = deriveCorrectedBalance(invoice.total, receipts.amount, credited, invoice.status);
      found(await s.invoices.update(is, { ...balance, paidAt: balance.status === "paid" ? receipts.paidAt : null }));
      return issued;
    });
  }
  async cancel(c: CurrentBusinessUser, id: string) { const sc = scope(c, id); return this.store.transaction(async s => { await this.member(s, c, "creditNotes.write"); const { note } = await this.locked(s, c, sc); if (note.status === "cancelled") return note; if (note.status !== "draft") throw new OperationalConflictError("Un avoir émis ne peut pas être annulé ou réécrit."); return found(await s.creditNotes.update(sc, { status: "cancelled" })); }); }
  async getDocument(c: CurrentBusinessUser, id: string) { const note = await this.getCreditNote(c, id); if (note.status !== "issued" || !note.snapshot) throw new OperationalConflictError("Seul un avoir émis possède un PDF."); const snapshot = creditNoteSnapshotSchema.parse(note.snapshot); if (snapshot.organizationId !== c.organizationId || snapshot.creditNoteId !== id) throw new OperationalConflictError("Document incohérent."); return snapshot; }
}
