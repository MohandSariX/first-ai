// Fictional explicit configuration for deterministic tests; never production defaults/seed.
import type { SellerInvoiceTerms, InvoiceBusinessDetails } from "@first-ai/schemas";
export const fictionalInvoiceTerms: SellerInvoiceTerms = {
  dueRule: "explicit", dueDays: null, paymentTermsText: "Paiement par virement à l’échéance convenue.",
  earlyDiscountMode: "none", earlyDiscountText: null, b2bPenaltyRule: "ecb_plus_10", legalRateMultiplier: null,
  b2bRecoveryIndemnity: true, publicPaymentTerms: "Règlement selon les conditions du marché public fictif.",
  franchiseVatMention: "TVA non applicable, art. 293 B du code général des impôts",
};
export const fictionalBusinessDetails: InvoiceBusinessDetails = {
  executionDate: "2026-10-01", periodStart: null, periodEnd: null, executionLocation: "Lieu fictif confirmé à Paris",
  purchaseOrderIssued: false, customerOrderReference: null, deliveryAddressDifferent: false,
  deliveryAddressLine1: null, deliveryAddressLine2: null, deliveryPostalCode: null, deliveryCity: null, deliveryCountry: null,
};
