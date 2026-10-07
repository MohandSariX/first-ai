import { describe, expect, it } from "vitest";
import { hasPermission } from "@first-ai/auth";
import { financialAuditSearchSchema, invoiceAdministrativeMetadataSchema } from "@first-ai/schemas";
describe("financial audit contract", () => {
  it("limits consultation to financial administrators", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] as const) expect(hasPermission(role, "financialAudit.read")).toBe(true);
    for (const role of ["TECHNICIAN", "READ_ONLY"] as const) expect(hasPermission(role, "financialAudit.read")).toBe(false);
  });
  it("bounds pagination and rejects browser tenant/actor input", () => {
    expect(financialAuditSearchSchema.parse({})).toEqual({ limit: 25, offset: 0 });
    for (const input of [{ limit: 101 }, { offset: 10001 }, { organizationId: "foreign" }, { actorUserId: "foreign" }]) expect(financialAuditSearchSchema.safeParse(input).success).toBe(false);
  });
  it("limits administrative edits to internal notes and OWNER/ADMIN", () => {
    for (const role of ["OWNER", "ADMIN"] as const) expect(hasPermission(role, "invoices.metadata.write")).toBe(true);
    for (const role of ["MANAGER", "ACCOUNTANT", "READ_ONLY", "TECHNICIAN"] as const) expect(hasPermission(role, "invoices.metadata.write")).toBe(false);
    expect(invoiceAdministrativeMetadataSchema.safeParse({ internalNotes: null, invoiceNumber: "FAC-forged" }).success).toBe(false);
    expect(invoiceAdministrativeMetadataSchema.safeParse({ internalNotes: "x".repeat(5001) }).success).toBe(false);
  });
});
