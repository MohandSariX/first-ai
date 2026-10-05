import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { Invoice, InvoiceScope, InvoiceStoreInterface } from "@first-ai/database";
import { addInvoiceItemSchema, createDraftInvoiceSchema, searchInvoicesSchema, updateInvoiceItemSchema } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";
import { calculateQuoteTotals } from "./quote-calculation.js";

export function calculateInvoiceTotals(items: readonly { quantity: string; unitPrice: string; taxRate: string }[]) {
  if (items.length > 200) throw new OperationalConflictError("Maximum 200 lignes par facture.");
  const { subtotal, taxAmount, total } = calculateQuoteTotals(items.map(item => ({ ...item, costEstimate: "0" })));
  return { subtotal, taxAmount, total };
}
// Only these transitions are executable in this foundation. Paid/sent statuses are compatibility vocabulary.
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
  async getInvoice(c: CurrentBusinessUser, id: string) { authorize(c, "invoices.read"); const s = scope(c, id); return { ...found(await this.store.invoices.get(s)), items: await this.store.invoices.items(s) }; }
  async searchInvoices(c: CurrentBusinessUser, input: unknown) { authorize(c, "invoices.read"); return this.store.invoices.search({ ...searchInvoicesSchema.parse(input), organizationId: c.organizationId }); }
  private async validateLinks(s: Pick<InvoiceStoreInterface, "customer" | "quotes" | "jobs">, c: CurrentBusinessUser, invoice: { customerId: string; quoteId?: string | null; jobId?: string | null }) {
    if (!await s.customer(c.organizationId, invoice.customerId)) throw new ResourceNotFoundError("Client introuvable.");
    if (invoice.quoteId) { const quote = found(await s.quotes.get({ organizationId: c.organizationId, quoteId: invoice.quoteId }, true)); if (quote.customerId !== invoice.customerId || quote.status !== "accepted") throw new OperationalConflictError("La source doit être un devis accepté du même client."); }
    if (invoice.jobId) { const job = found(await s.jobs.get({ organizationId: c.organizationId, jobId: invoice.jobId }, true)); if (job.customerId !== invoice.customerId || job.status !== "completed" || (invoice.quoteId && job.quoteId !== invoice.quoteId)) throw new OperationalConflictError("La source doit être une intervention terminée cohérente avec le client et le devis."); }
  }
  async createDraftInvoice(c: CurrentBusinessUser, input: unknown) { authorize(c, "invoices.write"); const parsed = createDraftInvoiceSchema.parse(input); return this.store.transaction(async s => { await this.validateLinks(s, c, parsed); return s.invoices.create(c.organizationId, c.userId, parsed); }); }
  private async persist(s: Pick<InvoiceStoreInterface, "invoices">, sc: InvoiceScope) { return found(await s.invoices.update(sc, calculateInvoiceTotals(await s.invoices.items(sc)))); }
  async addInvoiceItem(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "invoices.write"); const parsed = addInvoiceItemSchema.parse(input), sc = scope(c, id); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); if ((await s.invoices.items(sc)).length >= 200) throw new OperationalConflictError("Maximum 200 lignes par facture."); if (parsed.serviceId && !await s.service(c.organizationId, parsed.serviceId)) throw new ResourceNotFoundError("Prestation active introuvable."); const item = await s.invoices.addItem(sc, parsed); await this.persist(s, sc); return item; }); }
  async updateInvoiceItem(c: CurrentBusinessUser, id: string, itemId: string, input: unknown) { authorize(c, "invoices.write"); const parsed = updateInvoiceItemSchema.parse(input), sc = scope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); if (parsed.serviceId && !await s.service(c.organizationId, parsed.serviceId)) throw new ResourceNotFoundError("Prestation active introuvable."); const item = found(await s.invoices.updateItem(sc, itemId, parsed)); await this.persist(s, sc); return item; }); }
  async removeInvoiceItem(c: CurrentBusinessUser, id: string, itemId: string) { authorize(c, "invoices.write"); const sc = scope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.invoices.get(sc, true))); const item = found(await s.invoices.removeItem(sc, itemId)); await this.persist(s, sc); return item; }); }
  async calculateInvoice(c: CurrentBusinessUser, id: string) { return calculateInvoiceTotals((await this.getInvoice(c, id)).items); }
  async issueInvoice(c: CurrentBusinessUser, id: string) { authorize(c, "invoices.issue"); const sc = scope(c, id); return this.store.transaction(async s => { const invoice = found(await s.invoices.get(sc, true)); if (invoice.status === "issued") return invoice; assertInvoiceIssuable(invoice.status, (await s.invoices.items(sc)).length); await this.validateLinks(s, c, invoice); await this.persist(s, sc); return found(await s.invoices.update(sc, { status: "issued", issuedAt: new Date() })); }); }
  async cancelInvoice(c: CurrentBusinessUser, id: string) { authorize(c, "invoices.write"); const sc = scope(c, id); return this.store.transaction(async s => { assertInvoiceTransition(found(await s.invoices.get(sc, true)).status, "cancelled"); return found(await s.invoices.update(sc, { status: "cancelled" })); }); }
}
