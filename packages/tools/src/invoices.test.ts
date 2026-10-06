import { describe, expect, it } from "vitest";
import { hasPermission } from "@first-ai/auth";
import { invoiceNumber } from "@first-ai/database";
import { addInvoiceItemSchema, createDraftInvoiceSchema, searchInvoicesSchema, invoiceIssueCalendar } from "@first-ai/schemas";
import { assertInvoiceIssuable, assertInvoiceTransition, calculateInvoiceTotals } from "./invoice-service.js";

describe("invoice foundation", () => {
  it("calculates exact item VAT and totals with mixed rates and fractional quantities", () => {
    expect(calculateInvoiceTotals([{ quantity: "3", unitPrice: "0.10", taxRate: "20" }, { quantity: "0.125", unitPrice: "100.00", taxRate: "5.5" }])).toEqual({ subtotal: "12.80", taxAmount: "0.75", total: "13.55" });
    expect(calculateInvoiceTotals([{ quantity: "0.5", unitPrice: "0.01", taxRate: "50" }])).toEqual({ subtotal: "0.01", taxAmount: "0.01", total: "0.02" });
    expect(calculateInvoiceTotals([]).total).toBe("0.00");
  });
  it("rejects unsafe precision, excessive totals and unbounded items", () => {
    expect(() => calculateInvoiceTotals([{ quantity: "1", unitPrice: "0.001", taxRate: "20" }])).toThrow();
    expect(() => calculateInvoiceTotals([{ quantity: "999999", unitPrice: "9999999999.99", taxRate: "100" }])).toThrow();
    expect(() => calculateInvoiceTotals(Array.from({ length: 201 }, () => ({ quantity: "1", unitPrice: "1", taxRate: "0" })))).toThrow();
  });
  it("numbers deterministically without browser control", () => {
    expect(invoiceNumber(2026, 1)).toBe("FAC-2026-000001"); expect(invoiceNumber(2026, 2)).toBe("FAC-2026-000002");
    expect(() => invoiceNumber(2026, 1000000)).toThrow(); expect(() => invoiceNumber(2026, 0)).toThrow();
  });
  it("permits only explicit foundation transitions, not payment/backwards transitions", () => {
    expect(() => assertInvoiceTransition("draft", "issued")).not.toThrow(); expect(() => assertInvoiceTransition("draft", "cancelled")).not.toThrow();
    for (const [from, to] of [["issued", "draft"], ["cancelled", "issued"], ["draft", "paid"], ["issued", "cancelled"]] as const) expect(() => assertInvoiceTransition(from, to)).toThrow();
  });
  it("centralizes invoice permissions without broadening technician or read-only access", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] as const) for (const permission of ["invoices.read", "invoices.write", "invoices.issue"] as const) expect(hasPermission(role, permission)).toBe(true);
    expect(hasPermission("READ_ONLY", "invoices.read")).toBe(true); expect(hasPermission("READ_ONLY", "invoices.issue")).toBe(false); expect(hasPermission("READ_ONLY", "invoices.write")).toBe(false);
    expect(hasPermission("TECHNICIAN", "invoices.read")).toBe(false); expect(hasPermission("ACCOUNTANT", "quotes.write")).toBe(false);
  });
  it("requires a nonempty bounded draft before issue", () => {
    expect(() => assertInvoiceIssuable("draft", 1)).not.toThrow();
    for (const count of [0, 201, 1.5]) expect(() => assertInvoiceIssuable("draft", count)).toThrow();
    expect(() => assertInvoiceIssuable("cancelled", 1)).toThrow();
  });
  it("rejects tenant/number/status injection and bounds schemas", () => {
    const input = { customerId: "00000000-0000-4000-8000-000000000001", dueDate: "2026-01-31" };
    expect(createDraftInvoiceSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ organizationId: input.customerId }, { invoiceNumber: "FAC-2026-000001" }, { status: "paid" }, { issueDate: "2099-01-01" }, { issueDate: "2020-01-01" }, { issuedAt: "2026-01-01T00:00:00Z" }, { draftReference: "BROUILLON-fake" }]) expect(createDraftInvoiceSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(addInvoiceItemSchema.safeParse({ description: "Test", quantity: "1", unitPrice: "1", taxRate: "101" }).success).toBe(false);
    expect(searchInvoicesSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it("derives civil issue date and annual series explicitly across timezone/year boundaries", () => {
    expect(invoiceIssueCalendar(new Date("2026-12-31T22:59:59Z"), "Europe/Paris")).toEqual({ issueDate: "2026-12-31", fiscalYear: 2026 });
    expect(invoiceIssueCalendar(new Date("2026-12-31T23:00:00Z"), "Europe/Paris")).toEqual({ issueDate: "2027-01-01", fiscalYear: 2027 });
    expect(invoiceIssueCalendar(new Date("2026-12-31T23:00:00Z"), "UTC")).toEqual({ issueDate: "2026-12-31", fiscalYear: 2026 });
    expect(invoiceNumber(2027, 1)).toBe("FAC-2027-000001");
    expect(() => invoiceIssueCalendar(new Date(), "Invalid/Timezone")).toThrow();
  });
});
