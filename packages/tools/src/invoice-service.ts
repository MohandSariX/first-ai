import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { Invoice, InvoiceScope, InvoiceStoreInterface } from "@first-ai/database";
import { addInvoiceItemSchema, createDraftInvoiceSchema, invoiceClassificationSchema, invoiceDocumentSnapshotSchema, invoiceBusinessDetailsSchema, searchInvoicesSchema, updateInvoiceItemSchema } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";
import { calculateInvoiceAmounts, type InvoiceCalculationItem } from "./invoice-calculation.js";
import { createInvoiceDocumentSnapshot, invoiceDocumentAvailability, type InvoiceDocumentView } from "./invoice-document.js";

export function calculateInvoiceTotals(items: readonly InvoiceCalculationItem[]) {
  if (items.length > 200) throw new OperationalConflictError("Maximum 200 lignes par facture.");
  return calculateInvoiceAmounts(items);
}
// Manual invoice transitions only. PaymentService separately derives settlement states.
export function assertInvoiceTransition(from: Invoice["status"], to: Invoice["status"]) {
  if (from !== "draft" || (to !== "issued" && to !== "cancelled")) throw new OperationalConflictError("Transition de facture non autorisée.");
}
export function assertInvoiceIssuable(status: Invoice["status"], itemCount: number) {
  assertInvoiceTransition(status, "issued");
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 200) throw new OperationalConflictError("Une facture doit contenir entre 1 et 200 lignes avant l’émission.");
}
function authorize(c: CurrentBusinessUser, p: Permission) { if (!hasPermission(c.role, p)) throw new AuthorizationError("Action non autorisée."); }
function found<T>(v: T | undefined): T { if (v === undefined) throw new ResourceNotFoundError("Facture ou ressource introuvable."); return v; }
const scope = (c: CurrentBusinessUser, id: string): InvoiceScope => ({ organizationId: c.organizationId, invoiceId: z.uuid().parse(id) });
function draft(invoice: Invoice) { if (invoice.status !== "draft") throw new OperationalConflictError("Seul un brouillon peut être modifié."); }

export class InvoiceService {
  constructor(private readonly store: InvoiceStoreInterface) {}
  async getTimezone(c: CurrentBusinessUser) { authorize(c, "invoices.read"); return this.store.timezone(c.organizationId); }
  async getInvoice(c: CurrentBusinessUser, id: string) { authorize(c, "invoices.read"); const s = scope(c, id); return { ...found(await this.store.invoices.get(s)), items: await this.store.invoices.items(s) }; }
  async searchInvoices(c: CurrentBusinessUser, input: unknown) { authorize(c, "invoices.read"); return this.store.invoices.search({ ...searchInvoicesSchema.parse(input), organizationId: c.organizationId }); }
  private async validateLinks(s: Pick<InvoiceStoreInterface, "customer" | "quotes" | "jobs">, c: CurrentBusinessUser, invoice: { customerId: string; quoteId?: string | null; jobId?: string | null }) {
    if (!await s.customer(c.organizationId, invoice.customerId)) throw new ResourceNotFoundError("Client introuvable.");
    if (invoice.quoteId) { const quote = found(await s.quotes.get({ organizationId: c.organizationId, quoteId: invoice.quoteId }, true)); if (quote.customerId !== invoice.customerId || quote.status !== "accepted") throw new OperationalConflictError("La source doit être un devis accepté du même client."); }
    if (invoice.jobId) { const job = found(await s.jobs.get({ organizationId: c.organizationId, jobId: invoice.jobId }, true)); if (job.customerId !== invoice.customerId || job.status !== "completed" || (invoice.quoteId && job.quoteId !== invoice.quoteId)) throw new OperationalConflictError("La source doit être une intervention terminée cohérente avec le client et le devis."); }
  }
  async createDraftInvoice(c: CurrentBusinessUser, input: unknown) { authorize(c, "invoices.write"); const parsed = createDraftInvoiceSchema.parse(input); return this.store.transaction(async s => { await this.validateLinks(s, c, parsed); return s.invoices.create(c.organizationId, c.userId, parsed); }); }
  async updateClassification(c: CurrentBusinessUser, id: string, input: unknown) {
    authorize(c, "invoices.write"); const parsed = invoiceClassificationSchema.parse(input), sc = scope(c, id);
    return this.store.transaction(async s => {
      const member = await s.membership(c); if (!member) throw new AuthorizationError("Adhésion inactive.");
      authorize({ ...c, role: member.role }, "invoices.write");
      draft(found(await s.invoices.get(sc, true)));
      return found(await s.invoices.update(sc, parsed));
    });
  }
  async updateBusinessDetails(c: CurrentBusinessUser, id: string, input: unknown) {
    authorize(c, "invoices.write"); const businessDetails = invoiceBusinessDetailsSchema.parse(input), sc = scope(c, id);
    return this.store.transaction(async s => {
      const member = await s.membership(c); if (!member) throw new AuthorizationError("Adhésion inactive.");
      authorize({ ...c, role: member.role }, "invoices.write"); draft(found(await s.invoices.get(sc, true)));
      return found(await s.invoices.update(sc, { businessDetails }));
    });
  }
  private async persist(s: Pick<InvoiceStoreInterface, "invoices">, sc: InvoiceScope) { const totals = calculateInvoiceTotals(await s.invoices.items(sc)); return found(await s.invoices.update(sc, { ...totals, amountDue: totals.total })); }
  async addInvoiceItem(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "invoices.write"); const parsed = addInvoiceItemSchema.parse(input), sc = scope(c, id); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); if ((await s.invoices.items(sc)).length >= 200) throw new OperationalConflictError("Maximum 200 lignes par facture."); if (parsed.serviceId && !await s.service(c.organizationId, parsed.serviceId)) throw new ResourceNotFoundError("Prestation active introuvable."); const item = await s.invoices.addItem(sc, parsed); await this.persist(s, sc); return item; }); }
  async updateInvoiceItem(c: CurrentBusinessUser, id: string, itemId: string, input: unknown) { authorize(c, "invoices.write"); const parsed = updateInvoiceItemSchema.parse(input), sc = scope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); if (parsed.serviceId && !await s.service(c.organizationId, parsed.serviceId)) throw new ResourceNotFoundError("Prestation active introuvable."); const item = found(await s.invoices.updateItem(sc, itemId, parsed)); await this.persist(s, sc); return item; }); }
  async removeInvoiceItem(c: CurrentBusinessUser, id: string, itemId: string) { authorize(c, "invoices.write"); const sc = scope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); const item = found(await s.invoices.removeItem(sc, itemId)); await this.persist(s, sc); return item; }); }
  async calculateInvoice(c: CurrentBusinessUser, id: string) { return calculateInvoiceTotals((await this.getInvoice(c, id)).items); }
  async issueInvoice(c: CurrentBusinessUser, id: string) {
    authorize(c, "invoices.issue"); const sc = scope(c, id);
    return this.store.transaction(async s => {
      const membership = await s.membership(c);
      if (!membership) throw new AuthorizationError("Adhésion inactive.");
      authorize({ ...c, role: membership.role }, "invoices.issue");
      const invoice = found(await s.invoices.get(sc, true));
      if (invoice.issuedAt && invoice.documentSnapshot) return invoice; // Retry must not recapture mutable identities.
      if (invoice.status === "issued") return invoice; // Legacy issued invoice: no invented historical backfill.
      const items = await s.invoices.items(sc);
      assertInvoiceIssuable(invoice.status, items.length);
      await this.validateLinks(s, c, invoice);
      const identity = await s.billingIdentity(sc, invoice.customerId);
      const allocation = await s.invoices.allocateFiscalNumber(sc);
      if (invoice.dueDate < allocation.issueDate) throw new OperationalConflictError("L’échéance est antérieure à la date réelle d’émission. Créez un brouillon avec une échéance valide ; l’antidatage n’est pas autorisé.");
      const documentSnapshot = createInvoiceDocumentSnapshot({ ...invoice, ...allocation }, items, identity, allocation.issuedAt, { issuedAt: allocation.issuedAt.toISOString(), timeZone: allocation.timeZone, fiscalYear: allocation.fiscalYear });
      if (!invoiceDocumentAvailability(documentSnapshot).available) throw new OperationalConflictError("Émission impossible : configurez le nom, l’adresse, le code postal, la ville et le pays du vendeur avant l’émission.");
      return found(await s.invoices.update(sc, { invoiceNumber: allocation.invoiceNumber, issueDate: allocation.issueDate, ...documentSnapshot.totals, amountDue: documentSnapshot.totals.total, status: "issued", issuedAt: allocation.issuedAt, documentSnapshot }));
    });
  }
  async getInvoiceDocument(c: CurrentBusinessUser, id: string): Promise<InvoiceDocumentView> {
    authorize(c, "invoices.read"); const sc = scope(c, id);
    return this.store.transaction(async s => {
      const membership = await s.membership(c);
      if (!membership) throw new AuthorizationError("Adhésion inactive.");
      authorize({ ...c, role: membership.role }, "invoices.read");
      const invoice = found(await s.invoices.get(sc)); // One row contains the immutable body and coherent current balance.
      const availability = invoiceDocumentAvailability(invoice.documentSnapshot);
      if (!availability.available || !invoice.issuedAt || invoice.status === "draft") throw new OperationalConflictError(availability.message ?? "Une facture brouillon ne possède pas de document émis.");
      const snapshot = invoiceDocumentSnapshotSchema.parse(invoice.documentSnapshot);
      if (snapshot.organizationId !== c.organizationId || snapshot.invoiceId !== invoice.id) throw new OperationalConflictError("Document de facture invalide.");
      return { snapshot, payment: { status: invoice.status, amountPaid: invoice.amountPaid, amountDue: invoice.amountDue, asOf: invoice.updatedAt.toISOString() } };
    });
  }
  async cancelInvoice(c: CurrentBusinessUser, id: string) { authorize(c, "invoices.write"); const sc = scope(c, id); return this.store.transaction(async s => { assertInvoiceTransition(found(await s.invoices.get(sc, true)).status, "cancelled"); return found(await s.invoices.update(sc, { status: "cancelled" })); }); }
}
