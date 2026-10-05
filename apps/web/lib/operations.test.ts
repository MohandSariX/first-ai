import { describe, expect, it } from "vitest";
import { operationalCapabilities } from "./operations";
import { parseOperationalForm } from "./operational-form-input";
const context = { authUserId: "identity", userId: "technician", organizationId: "tenant", role: "TECHNICIAN" as const };
describe("operational permission-aware UI", () => {
  it("hides administration and restricts technician controls to assignments", () => { expect(operationalCapabilities(context, { assignedUserId: "other" })).toMatchObject({ quoteWrite: false, quoteAccept: false, schedule: false, execute: false, reportWrite: false }); expect(operationalCapabilities(context, { assignedUserId: context.userId })).toMatchObject({ execute: true, reportWrite: true }); });
  it("read-only and accountant roles have no mutation controls", () => { for (const role of ["READ_ONLY", "ACCOUNTANT"] as const) expect(Object.values(operationalCapabilities({ ...context, role })).every(v => !v)).toBe(true); });
  it("reuses item schemas without coercing money into numbers", () => { const form = new FormData(); for (const [key, value] of Object.entries({ description: "Test", quantity: "1.5", unitPrice: "10.01", taxRate: "5.5", costEstimate: "2" })) form.set(key, value); expect(parseOperationalForm("quote.addItem", form)).toMatchObject({ unitPrice: "10.01", quantity: "1.5", taxRate: "5.5" }); form.set("quantity", "0"); expect(() => parseOperationalForm("quote.addItem", form)).toThrow(); });
});
