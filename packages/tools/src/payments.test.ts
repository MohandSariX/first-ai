import { describe, expect, it } from "vitest";
import { hasPermission } from "@first-ai/auth";
import { cancelPaymentSchema, listPaymentsSchema, recordPaymentSchema } from "@first-ai/schemas";
import { deriveInvoiceBalance, paymentCents } from "./payment-service.js";

describe("manual payment rules", () => {
  it("derives exact balances, partial and full payment without floats", () => {
    expect(deriveInvoiceBalance("0.30", "0.10", "issued")).toEqual({ amountPaid: "0.10", amountDue: "0.20", status: "partially_paid" });
    expect(deriveInvoiceBalance("0.30", "0.30", "partially_paid")).toEqual({ amountPaid: "0.30", amountDue: "0.00", status: "paid" });
    expect(paymentCents("999999999999.99")).toBe(99999999999999n);
  });
  it("rejects overpayment, negatives, excess precision and exponent notation", () => {
    expect(() => deriveInvoiceBalance("1", "1.01", "issued")).toThrow(/dépasse/);
    for (const v of ["-1", "1.001", "1e2", "Infinity", "1000000000000"]) expect(() => paymentCents(v)).toThrow();
  });
  it("restores balance on correction and does not mark zero invoices paid", () => {
    expect(deriveInvoiceBalance("100", "0", "paid")).toEqual({ amountPaid: "0.00", amountDue: "100.00", status: "issued" });
    expect(deriveInvoiceBalance("0", "0", "issued").status).toBe("issued");
    expect(deriveInvoiceBalance("100", "0", "overdue").status).toBe("overdue");
  });
  it("centralizes read/write permissions without technician financial access", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] as const) expect(hasPermission(role, "payments.write")).toBe(true);
    expect(hasPermission("READ_ONLY", "payments.read")).toBe(true);
    expect(hasPermission("READ_ONLY", "payments.write")).toBe(false);
    expect(hasPermission("TECHNICIAN", "payments.read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "payments.write")).toBe(false);
  });
  it("rejects untrusted authority, zero amounts, unsupported debit and unbounded lists", () => {
    const input = { amount: "10.50", method: "cash", paidAt: "2026-01-01T10:00:00Z", idempotencyKey: "00000000-0000-4000-8000-000000000001" };
    expect(recordPaymentSchema.parse(input).reference).toBe("");
    for (const extra of [{ organizationId: input.idempotencyKey }, { customerId: input.idempotencyKey }, { status: "completed" }, { amount: "0.00" }, { method: "direct_debit" }]) expect(recordPaymentSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(cancelPaymentSchema.safeParse({ reason: " " }).success).toBe(false);
    expect(listPaymentsSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
