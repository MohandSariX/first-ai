import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max).nullable();
// Incomplete configuration is allowed; applicability is checked atomically at issue.
export const sellerInvoiceTermsSchema = z.strictObject({
  dueRule: z.enum(["explicit", "invoice_days", "execution_days"]).nullable(),
  dueDays: z.number().int().min(0).max(60).nullable(),
  paymentTermsText: text(1000),
  earlyDiscountMode: z.enum(["none", "configured"]).nullable(), earlyDiscountText: text(1000),
  b2bPenaltyRule: z.enum(["ecb_plus_10", "legal_rate_multiple"]).nullable(),
  legalRateMultiplier: z.number().int().min(3).max(100).nullable(),
  b2bRecoveryIndemnity: z.boolean().nullable(),
  publicPaymentTerms: text(1000), franchiseVatMention: text(500),
});
export type SellerInvoiceTerms = z.infer<typeof sellerInvoiceTermsSchema>;
export const invoiceBusinessDetailsSchema = z.strictObject({
  executionDate: z.iso.date().nullable(), periodStart: z.iso.date().nullable(), periodEnd: z.iso.date().nullable(),
  executionLocation: text(500),
  purchaseOrderIssued: z.boolean().nullable(), customerOrderReference: text(120),
  deliveryAddressDifferent: z.boolean().nullable(),
  deliveryAddressLine1: text(255), deliveryAddressLine2: text(255),
  deliveryPostalCode: text(20), deliveryCity: text(120), deliveryCountry: z.string().regex(/^[A-Z]{2}$/).nullable(),
});
export type InvoiceBusinessDetails = z.infer<typeof invoiceBusinessDetailsSchema>;
export const invoicePaymentTermsSnapshotSchema = z.strictObject({
  dueRule: z.enum(["explicit", "invoice_days", "execution_days"]), dueDays: z.number().int().min(0).max(60).nullable(),
  dueDate: z.iso.date(), paymentTermsText: z.string().min(1).max(1000),
  earlyDiscountText: text(1000), latePenaltyText: text(1000),
  recoveryIndemnityAmount: z.literal("40.00").nullable(), publicPaymentTerms: text(1000),
});
