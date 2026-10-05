import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { Invoice, InvoiceScope, Payment, PaymentSession, PaymentStoreInterface } from "@first-ai/database";
import { cancelPaymentSchema, listPaymentsSchema, recordPaymentSchema, type RecordPaymentInput } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";

export function paymentCents(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new OperationalConflictError("Montant décimal invalide.");
  const [whole = "0", fraction = ""] = value.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
const money = (n: bigint) => `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
export function deriveInvoiceBalance(total: string, received: string, previous: Invoice["status"]) {
  const totalCents = paymentCents(total), paidCents = paymentCents(received);
  if (paidCents > totalCents) throw new OperationalConflictError("Le paiement dépasse le solde restant de la facture.");
  const status: Invoice["status"] = paidCents > 0n ? (paidCents === totalCents ? "paid" : "partially_paid") : (previous === "paid" || previous === "partially_paid" ? "issued" : previous);
  return { amountPaid: money(paidCents), amountDue: money(totalCents - paidCents), status };
}
function authorize(c: CurrentBusinessUser, permission: Permission) { if (!hasPermission(c.role, permission)) throw new AuthorizationError("Action non autorisée."); }
function found<T>(v: T | undefined): T { if (v === undefined) throw new ResourceNotFoundError("Facture ou paiement introuvable."); return v; }
const scope = (c: CurrentBusinessUser, id: string): InvoiceScope => ({ organizationId: c.organizationId, invoiceId: z.uuid().parse(id) });
function sameReceipt(p: Payment, invoiceId: string, input: RecordPaymentInput) { return p.invoiceId === invoiceId && paymentCents(p.amount) === paymentCents(input.amount) && p.method === input.method && p.reference === input.reference && p.paidAt.getTime() === new Date(input.paidAt).getTime(); }

export class PaymentService {
  constructor(private readonly store: PaymentStoreInterface) {}
  async listPayments(c: CurrentBusinessUser, invoiceId: string, input: unknown = {}) {
    authorize(c, "payments.read"); const sc = scope(c, invoiceId), pagination = listPaymentsSchema.parse(input);
    found(await this.store.invoices.get(sc)); return this.store.payments.list(sc, pagination);
  }
  private async currentWriter(s: PaymentSession, c: CurrentBusinessUser) {
    // Re-check DB role, not a stale caller context, before any receipt mutation.
    const membership = await s.membership(c); if (!membership) throw new AuthorizationError("Adhésion inactive ou indisponible.");
    authorize({ ...c, role: membership.role }, "payments.write");
  }
  private async synchronize(s: PaymentSession, sc: InvoiceScope, invoice: Invoice) {
    const summary = await s.payments.summary(sc), balance = deriveInvoiceBalance(invoice.total, summary.amount, invoice.status);
    return found(await s.invoices.update(sc, { ...balance, paidAt: balance.status === "paid" ? summary.paidAt : null }));
  }
  async recordPayment(c: CurrentBusinessUser, invoiceId: string, input: unknown) {
    authorize(c, "payments.write"); const parsed = recordPaymentSchema.parse(input), sc = scope(c, invoiceId);
    if (new Date(parsed.paidAt).getTime() > Date.now()) throw new OperationalConflictError("Un encaissement ne peut pas être daté dans le futur.");
    return this.store.transaction(async s => {
      await this.currentWriter(s, c);
      const invoice = found(await s.invoices.get(sc, true));
      const existing = await s.payments.byKey(c.organizationId, parsed.idempotencyKey);
      if (existing) { if (!sameReceipt(existing, invoiceId, parsed)) throw new OperationalConflictError("Cette clé correspond à un autre encaissement."); return { payment: existing, invoice }; }
      if (!["issued", "sent", "overdue", "partially_paid"].includes(invoice.status)) throw new OperationalConflictError("Seule une facture émise avec un solde peut recevoir un paiement.");
      const summary = await s.payments.summary(sc);
      deriveInvoiceBalance(invoice.total, money(paymentCents(summary.amount) + paymentCents(parsed.amount)), invoice.status);
      const payment = await s.payments.create({ ...parsed, paidAt: new Date(parsed.paidAt), ...sc, customerId: invoice.customerId, createdByUserId: c.userId });
      if (!payment) throw new OperationalConflictError("Cette clé correspond à un autre encaissement concurrent.");
      return { payment, invoice: await this.synchronize(s, sc, invoice) };
    });
  }
  async cancelPayment(c: CurrentBusinessUser, invoiceId: string, paymentId: string, input: unknown) {
    authorize(c, "payments.write"); const parsed = cancelPaymentSchema.parse(input), sc = scope(c, invoiceId); z.uuid().parse(paymentId);
    return this.store.transaction(async s => {
      await this.currentWriter(s, c); const invoice = found(await s.invoices.get(sc, true));
      if (!["issued", "sent", "overdue", "partially_paid", "paid"].includes(invoice.status)) throw new OperationalConflictError("Cette facture ne permet pas une correction d’encaissement.");
      const existing = found(await s.payments.get(sc, paymentId));
      if (existing.status === "cancelled") return { payment: existing, invoice };
      const payment = found(await s.payments.cancel(sc, paymentId, c.userId, parsed.reason));
      return { payment, invoice: await this.synchronize(s, sc, invoice) };
    });
  }
}
