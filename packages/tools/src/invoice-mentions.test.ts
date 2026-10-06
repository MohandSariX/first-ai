import { describe, expect, it } from "vitest";
import { invoiceBusinessDetailsSchema, sellerInvoiceTermsSchema, addInvoiceItemSchema } from "@first-ai/schemas";
import { captureInvoiceMentions } from "./invoice-mentions.js";
import { calculateInvoiceAmounts, calculateInvoiceLine } from "./invoice-calculation.js";
import { fictionalBusinessDetails as details, fictionalInvoiceTerms as terms } from "./test-invoice-mentions.js";
const input = { businessDetails: details, terms, classification: { transactionType: "B2B" as const, operationCategory: "services" as const, fiscalTerritory: "domestic" as const, vatTreatment: "normal" as const, vatReason: null }, issueDate: "2026-10-06", dueDate: "2026-11-05" };
describe("M3 invoice mentions and exact adjustments", () => {
  it("captures confirmed execution, PO and professional terms without mutable configuration", () => {
    const result = captureInvoiceMentions({ ...input, businessDetails: { ...details, purchaseOrderIssued: true, customerOrderReference: "BC-FICTIF-1" } });
    expect(result.businessDetails.executionDate).toBe("2026-10-01"); expect(result.businessDetails.customerOrderReference).toBe("BC-FICTIF-1");
    expect(result.paymentTerms).toMatchObject({ earlyDiscountText: "Escompte pour paiement anticipé : néant.", recoveryIndemnityAmount: "40.00" });
    expect(result.paymentTerms.latePenaltyText).toContain("BCE");
  });
  it("supports a confirmed complete service period, never substitutes issue/payment/job dates", () => {
    expect(captureInvoiceMentions({ ...input, businessDetails: { ...details, executionDate: null, periodStart: "2026-09-01", periodEnd: "2026-09-30" } }).businessDetails.periodEnd).toBe("2026-09-30");
    for (const patch of [{ executionDate: null }, { executionDate: "2026-12-01" }, { periodStart: "2026-09-01" }, { executionDate: null, periodStart: "2026-10-02", periodEnd: "2026-10-01" }, { purchaseOrderIssued: true }]) expect(() => captureInvoiceMentions({ ...input, businessDetails: { ...details, ...patch } })).toThrow();
  });
  it("does not require or copy private B2B terms for B2C and requires a confirmed service location", () => {
    const consumer = { ...input, classification: { ...input.classification, transactionType: "B2C" as const }, terms: { ...terms, b2bPenaltyRule: null, b2bRecoveryIndemnity: null, earlyDiscountMode: null } };
    expect(captureInvoiceMentions(consumer).paymentTerms).toMatchObject({ earlyDiscountText: null, latePenaltyText: null, recoveryIndemnityAmount: null, publicPaymentTerms: null });
    expect(() => captureInvoiceMentions({ ...consumer, businessDetails: { ...details, executionLocation: null } })).toThrow();
  });
  it("keeps public terms distinct and never applies private penalty/40 euro rules to B2G", () => {
    const publicInput = { ...input, classification: { ...input.classification, transactionType: "B2G" as const } };
    expect(captureInvoiceMentions(publicInput).paymentTerms).toMatchObject({ latePenaltyText: null, recoveryIndemnityAmount: null, publicPaymentTerms: terms.publicPaymentTerms });
    expect(() => captureInvoiceMentions({ ...publicInput, terms: { ...terms, publicPaymentTerms: null } })).toThrow();
  });
  it("renders only structured configured fiscal qualification, never guesses from rate zero", () => {
    for (const [treatment, expected] of [["franchise", "293 B"], ["exemption", "Exonération de TVA"], ["reverse_charge", "Autoliquidation"]] as const) expect(captureInvoiceMentions({ ...input, classification: { ...input.classification, vatTreatment: treatment, vatReason: "Base fiscale fictive validée" } }).vatMention).toContain(expected);
    expect(captureInvoiceMentions(input).vatMention).toBeNull();
    expect(() => captureInvoiceMentions({ ...input, classification: { ...input.classification, vatTreatment: "franchise" }, terms: { ...terms, franchiseVatMention: null } })).toThrow();
    expect(() => captureInvoiceMentions({ ...input, classification: { ...input.classification, vatTreatment: "exemption" } })).toThrow();
  });
  it("requires relevant B2B configuration and checks exact calendar due rules and supported limits", () => {
    for (const patch of [{ paymentTermsText: null }, { b2bPenaltyRule: null }, { earlyDiscountMode: null }, { b2bRecoveryIndemnity: false }, { earlyDiscountMode: "configured", earlyDiscountText: null }]) expect(() => captureInvoiceMentions({ ...input, terms: { ...terms, ...patch } })).toThrow();
    expect(captureInvoiceMentions({ ...input, terms: { ...terms, dueRule: "invoice_days", dueDays: 30 } }).paymentTerms.dueDays).toBe(30);
    expect(() => captureInvoiceMentions({ ...input, terms: { ...terms, dueRule: "execution_days", dueDays: 30 } })).toThrow();
    expect(() => captureInvoiceMentions({ ...input, dueDate: "2027-01-01" })).toThrow();
    expect(sellerInvoiceTermsSchema.safeParse({ ...terms, legalRateMultiplier: 2 }).success).toBe(false);
    expect(captureInvoiceMentions({ ...input, terms: { ...terms, b2bPenaltyRule: "legal_rate_multiple", legalRateMultiplier: 3 } }).paymentTerms.latePenaltyText).toContain("3 fois");
  });
  it("requires explicit distinct goods delivery information, not a copied service site", () => {
    const goods = { ...input, classification: { ...input.classification, operationCategory: "goods" as const } };
    expect(() => captureInvoiceMentions({ ...goods, businessDetails: { ...details, deliveryAddressDifferent: null } })).toThrow();
    expect(() => captureInvoiceMentions({ ...goods, businessDetails: { ...details, deliveryAddressDifferent: true } })).toThrow();
    expect(captureInvoiceMentions({ ...goods, businessDetails: { ...details, deliveryAddressDifferent: true, deliveryAddressLine1: "Adresse biens fictive", deliveryPostalCode: "75001", deliveryCity: "Paris", deliveryCountry: "FR" } }).businessDetails.deliveryCity).toBe("Paris");
  });
  it("computes discounts before VAT and positive explicit charges across multiple rates", () => {
    const items = [{ quantity: "2", unitPrice: "100", taxRate: "20", discountAmount: "10" }, { quantity: "1", unitPrice: "10", taxRate: "5.5", kind: "charge", discountAmount: "0" }];
    expect(calculateInvoiceAmounts(items)).toEqual({ subtotal: "200.00", taxAmount: "38.55", total: "238.55" });
    expect(calculateInvoiceLine(items[0]!)).toEqual({ grossSubtotal: "200.00", discountAmount: "10.00", subtotal: "190.00", taxAmount: "38.00", total: "228.00" });
    expect(calculateInvoiceAmounts([{ quantity: "0.5", unitPrice: "0.03", taxRate: "50", discountAmount: "0.01" }])).toEqual({ subtotal: "0.01", taxAmount: "0.01", total: "0.02" });
    expect(calculateInvoiceAmounts([{ quantity: "1", unitPrice: "10", taxRate: "20", discountAmount: "10" }]).total).toBe("0.00");
    for (const item of [{ quantity: "1", unitPrice: "1", taxRate: "20", discountAmount: "1.01" }, { quantity: "2", unitPrice: "1", taxRate: "20", kind: "charge" }, { quantity: "1", unitPrice: "1", taxRate: "20", discountAmount: "-1" }]) expect(() => calculateInvoiceAmounts([item])).toThrow();
  });
  it("bounds custom units and rejects caller tenant/date/structured-data injection", () => {
    expect(addInvoiceItemSchema.parse({ description: "Test", quantity: "1", unitPrice: "10", taxRate: "20", unit: "m²" }).unit).toBe("m²");
    expect(addInvoiceItemSchema.safeParse({ description: "Test", quantity: "1", unitPrice: "10", taxRate: "20", unit: "a".repeat(25) }).success).toBe(false);
    expect(invoiceBusinessDetailsSchema.safeParse({ ...details, organizationId: "forged" }).success).toBe(false);
  });
});
