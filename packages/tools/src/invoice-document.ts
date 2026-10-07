import { invoiceDocumentSnapshotSchema, sellerBillingSchema, customerBillingSchema, invoiceClassificationSchema, validateBillingScenario, type InvoiceDocumentSnapshot } from "@first-ai/schemas";
import type { Invoice, InvoiceItem, InvoiceSession } from "@first-ai/database";
import { calculateInvoiceLine, calculateInvoiceAmounts } from "./invoice-calculation.js";
import { captureInvoiceMentions } from "./invoice-mentions.js";
import { OperationalConflictError } from "./operational-policies.js";

type Identity = Awaited<ReturnType<InvoiceSession["billingIdentity"]>>;
function cents(v: string) { return BigInt(v.replace(".", "")); }
function money(v: bigint) { const s = v.toString().padStart(3, "0"); return `${s.slice(0, -2)}.${s.slice(-2)}`; }
export function createInvoiceDocumentSnapshot(invoice: Invoice, items: readonly InvoiceItem[], identity: Identity, capturedAt: Date, issuance: { issuedAt: string; timeZone: string; fiscalYear: number }): InvoiceDocumentSnapshot {
  const { seller, customer } = identity;
  if (!seller || !customer || seller.id !== invoice.organizationId || customer.organizationId !== invoice.organizationId || customer.id !== invoice.customerId) throw new OperationalConflictError("Identité de facturation indisponible.");
  if (seller.currency !== "EUR") throw new OperationalConflictError("Seules les factures en EUR sont prises en charge.");
  const fiscalIdentity = sellerBillingSchema.safeParse(Object.fromEntries(Object.keys(sellerBillingSchema.shape).map(k => [k, seller[k as keyof typeof seller]])));
  const billingIdentity = customerBillingSchema.safeParse(Object.fromEntries(Object.keys(customerBillingSchema.shape).map(k => [k, customer[k as keyof typeof customer]])));
  const classification = invoiceClassificationSchema.safeParse({ transactionType: invoice.transactionType, operationCategory: invoice.operationCategory, fiscalTerritory: invoice.fiscalTerritory, vatTreatment: invoice.vatTreatment, vatReason: invoice.vatReason });
  if (!fiscalIdentity.success || !billingIdentity.success || !classification.success) throw new OperationalConflictError("Émission impossible : configurez les identités de facturation et la classification fiscale explicite du brouillon.");
  const gaps = validateBillingScenario(fiscalIdentity.data, billingIdentity.data, classification.data, items.map(i => i.taxRate));
  if (gaps.length) throw new OperationalConflictError(`Émission impossible : ${gaps.join(" ")}`);
  const billing = billingIdentity.data;
  if (!invoice.issueDate) throw new OperationalConflictError("Date d’émission indisponible.");
  const mentions = captureInvoiceMentions({ businessDetails: invoice.businessDetails, terms: seller.invoiceTerms, classification: classification.data, issueDate: invoice.issueDate, dueDate: invoice.dueDate });
  const lines = items.map(item => {
    const amounts = calculateInvoiceLine(item);
    const [whole = "0", fraction = ""] = item.taxRate.split(".");
    return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, unit: item.unit, kind: item.kind,
      taxRate: `${BigInt(whole)}.${fraction.padEnd(3, "0")}`, ...amounts };
  });
  const groups = new Map<string, { base: bigint; amount: bigint }>();
  for (const line of lines) { const g = groups.get(line.taxRate) ?? { base: 0n, amount: 0n }; g.base += cents(line.subtotal); g.amount += cents(line.taxAmount); groups.set(line.taxRate, g); }
  const { subtotal, taxAmount, total } = calculateInvoiceAmounts(items);
  return invoiceDocumentSnapshotSchema.parse({
    version: 4, issuance, ...mentions, organizationId: invoice.organizationId, invoiceId: invoice.id,
    capturedAt: capturedAt.toISOString(), currency: seller.currency,
    seller: { name: seller.name, legalName: seller.legalName, addressLine1: seller.addressLine1, addressLine2: seller.addressLine2, postalCode: seller.postalCode, city: seller.city, country: seller.country, siret: seller.siret, vatNumber: seller.vatNumber, email: seller.email, phone: seller.phone, fiscalIdentity: fiscalIdentity.data },
    customer: { name: billing.billingName, legalName: billing.billingLegalName, addressLine1: billing.billingAddressLine1, addressLine2: billing.billingAddressLine2, postalCode: billing.billingPostalCode, city: billing.billingCity, country: billing.billingCountry, siret: billing.siret, vatNumber: billing.vatNumber, email: customer.billingEmail, phone: customer.phone, billingIdentity: billing },
    classification: classification.data,
    invoice: { number: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate, status: "issued", notes: invoice.notes },
    lines, totals: { subtotal, taxAmount, total },
    taxes: [...groups].sort(([a], [b]) => Number(a) - Number(b)).map(([rate, g]) => ({ rate, base: money(g.base), amount: money(g.amount) })),
  });
}

export function invoiceDocumentAvailability(value: unknown): { available: boolean; message: string | null } {
  const result = invoiceDocumentSnapshotSchema.safeParse(value);
  if (!result.success) return { available: false, message: "Document indisponible : aucun snapshot valide n’a été conservé à l’émission. Aucun historique ne sera inventé." };
  const s = result.data.seller;
  if (![s.legalName || s.name, s.addressLine1, s.postalCode, s.city, s.country].every(v => Boolean(v?.trim()))) return { available: false, message: "PDF indisponible : l’identité du vendeur conservée à l’émission est incomplète (nom, adresse, code postal, ville, pays). Configurez l’organisation avant les prochaines émissions." };
  return { available: true, message: null };
}

export interface InvoiceDocumentView {
  snapshot: InvoiceDocumentSnapshot;
  payment: { status: Invoice["status"]; amountPaid: string; amountDue: string; amountCredited?: string; customerCredit?: string; asOf: string };
}
