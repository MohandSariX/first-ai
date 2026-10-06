import { z } from "zod";
import { sellerBillingSchema, customerBillingSchema, invoiceClassificationSchema } from "./billing.js";
import { invoiceBusinessDetailsSchema, invoicePaymentTermsSnapshotSchema } from "./invoice-mentions.js";

const nullableText = (max: number) => z.string().max(max).nullable();
const money = z.string().regex(/^\d{1,12}\.\d{2}$/);
const identity = z.strictObject({
  name: z.string().min(1).max(255), legalName: nullableText(255),
  addressLine1: nullableText(255), addressLine2: nullableText(255),
  postalCode: nullableText(20), city: nullableText(120), country: nullableText(2),
  siret: nullableText(14), vatNumber: nullableText(32),
  email: nullableText(320), phone: nullableText(32),
});

// A versioned document DTO, not a live CRM record. No internal notes or secrets.
export const invoiceDocumentSnapshotV1Schema = z.strictObject({
  version: z.literal(1), organizationId: z.uuid(), invoiceId: z.uuid(),
  capturedAt: z.iso.datetime(), currency: z.literal("EUR"),
  seller: identity, customer: identity,
  invoice: z.strictObject({
    number: z.string().regex(/^FAC-\d{4}-\d{6}$/),
    issueDate: z.iso.date(), dueDate: z.iso.date(), status: z.literal("issued"),
    notes: nullableText(5000),
  }),
  lines: z.array(z.strictObject({
    description: z.string().min(1).max(5000),
    quantity: z.string().regex(/^\d{1,6}(\.\d{1,3})?$/),
    unitPrice: money, taxRate: z.string().regex(/^\d{1,3}\.\d{3}$/),
    subtotal: money, taxAmount: money, total: money,
  })).min(1).max(200),
  totals: z.strictObject({ subtotal: money, taxAmount: money, total: money }),
  taxes: z.array(z.strictObject({ rate: z.string().regex(/^\d{1,3}\.\d{3}$/), base: money, amount: money })).min(1).max(200),
});
export const invoiceDocumentSnapshotV2Schema = invoiceDocumentSnapshotV1Schema.extend({
  version: z.literal(2),
  seller: identity.extend({ fiscalIdentity: sellerBillingSchema }),
  customer: identity.extend({ billingIdentity: customerBillingSchema }),
  classification: invoiceClassificationSchema,
});
export function invoiceIssueCalendar(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return { issueDate: `${value("year")}-${value("month")}-${value("day")}`, fiscalYear: Number(value("year")) };
}
export const invoiceDocumentSnapshotV3Schema = invoiceDocumentSnapshotV2Schema.extend({
  version: z.literal(3),
  issuance: z.strictObject({ issuedAt: z.iso.datetime(), timeZone: z.string().min(1).max(100), fiscalYear: z.number().int().min(1000).max(9999) }),
}).superRefine((snapshot, context) => {
  try {
    const date = invoiceIssueCalendar(new Date(snapshot.issuance.issuedAt), snapshot.issuance.timeZone);
    if (snapshot.capturedAt !== snapshot.issuance.issuedAt || date.issueDate !== snapshot.invoice.issueDate || date.fiscalYear !== snapshot.issuance.fiscalYear || !snapshot.invoice.number.startsWith(`FAC-${date.fiscalYear}-`) || snapshot.invoice.dueDate < date.issueDate) context.addIssue({ code: "custom", message: "Métadonnées d’émission incohérentes." });
  } catch { context.addIssue({ code: "custom", message: "Fuseau d’émission invalide." }); }
});
export const invoiceDocumentSnapshotV4Schema = invoiceDocumentSnapshotV2Schema.extend({
  version: z.literal(4), issuance: invoiceDocumentSnapshotV3Schema.shape.issuance,
  businessDetails: invoiceBusinessDetailsSchema, paymentTerms: invoicePaymentTermsSnapshotSchema,
  vatMention: nullableText(1000),
  lines: z.array(invoiceDocumentSnapshotV1Schema.shape.lines.element.extend({
    unit: z.string().trim().min(1).max(24), kind: z.enum(["item", "charge"]),
    grossSubtotal: money, discountAmount: money,
  })).min(1).max(200),
}).superRefine((s, ctx) => {
  // Reuse v3's trusted time validation without changing the historical DTO.
  const { businessDetails, paymentTerms, vatMention: _vatMention, ...previous } = s;
  void _vatMention;
  const result = invoiceDocumentSnapshotV3Schema.safeParse({ ...previous, version: 3,
    lines: previous.lines.map(({ unit: _u, kind: _k, grossSubtotal: _g, discountAmount: _d, ...line }) => { void _u; void _k; void _g; void _d; return line; }),
  });
  if (!result.success || paymentTerms.dueDate !== s.invoice.dueDate || !(businessDetails.executionDate ?? businessDetails.periodEnd)) ctx.addIssue({ code: "custom", message: "Document M3 incohérent." });
  if (s.classification.transactionType !== "B2B" && (paymentTerms.latePenaltyText !== null || paymentTerms.recoveryIndemnityAmount !== null || paymentTerms.earlyDiscountText !== null)) ctx.addIssue({ code: "custom", message: "Mentions privées B2B interdites sur ce scénario." });
});
export const invoiceDocumentSnapshotSchema = z.discriminatedUnion("version", [invoiceDocumentSnapshotV1Schema, invoiceDocumentSnapshotV2Schema, invoiceDocumentSnapshotV3Schema, invoiceDocumentSnapshotV4Schema]);
export type InvoiceDocumentSnapshot = z.infer<typeof invoiceDocumentSnapshotSchema>;
