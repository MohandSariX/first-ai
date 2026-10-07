import { describe, expect, it } from "vitest";
import { operationalCapabilities } from "./operations";
import { parseOperationalForm } from "./operational-form-input";
const context = { authUserId: "identity", userId: "technician", organizationId: "tenant", role: "TECHNICIAN" as const };
describe("operational permission-aware UI", () => {
  it("hides administration and restricts technician controls to assignments", () => { expect(operationalCapabilities(context, { assignedUserId: "other" })).toMatchObject({ quoteWrite: false, quoteAccept: false, schedule: false, execute: false, reportWrite: false }); expect(operationalCapabilities(context, { assignedUserId: context.userId })).toMatchObject({ execute: true, reportWrite: true }); });
  it("read-only and accountant roles have no mutation controls", () => { for (const role of ["READ_ONLY", "ACCOUNTANT"] as const) expect(Object.values(operationalCapabilities({ ...context, role })).every(v => !v)).toBe(true); });
  it("reuses item schemas without coercing money into numbers", () => { const form = new FormData(); for (const [key, value] of Object.entries({ description: "Test", quantity: "1.5", unitPrice: "10.01", taxRate: "5.5", costEstimate: "2" })) form.set(key, value); expect(parseOperationalForm("quote.addItem", form)).toMatchObject({ unitPrice: "10.01", quantity: "1.5", taxRate: "5.5" }); form.set("quantity", "0"); expect(() => parseOperationalForm("quote.addItem", form)).toThrow(); });
  it("validates explicit invoice classifications without accepting a missing choice", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ transactionType: "B2C", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal" })) form.set(key, value);
    expect(parseOperationalForm("invoice.classify", form)).toEqual({ transactionType: "B2C", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal", vatReason: null });
    form.delete("transactionType"); expect(() => parseOperationalForm("invoice.classify", form)).toThrow();
  });
  it("keeps unknown taxable-person qualification null, not a coerced false", () => {
    const form = new FormData();
    form.set("billingName", "Client fictif"); form.set("taxablePerson", "");
    expect(parseOperationalForm("billing.customer", form)).toMatchObject({ billingName: "Client fictif", taxablePerson: null, billingAddressLine1: null });
    form.set("taxablePerson", "no"); expect(parseOperationalForm("billing.customer", form)).toMatchObject({ taxablePerson: false });
  });
  it("M4 validates explicit original line selection and keeps correction money exact", () => {
    const form = new FormData(); form.set("subtotal", "20.01");
    expect(() => parseOperationalForm("credit.setItem", form)).toThrow();
    form.set("originalLineIndex", "0"); expect(parseOperationalForm("credit.setItem", form)).toEqual({ originalLineIndex: 0, subtotal: "20.01" });
    form.set("subtotal", "-1"); expect(() => parseOperationalForm("credit.setItem", form)).toThrow();
    form.set("originalLineIndex", "200"); expect(() => parseOperationalForm("credit.removeItem", form)).toThrow();
  });
});
