import { describe, expect, it, vi } from "vitest";
import type { CurrentBusinessUser } from "@first-ai/auth";
import { CrmDashboardService, LeadSummaryService } from "./crm-services.js";
import { createCrmSummaryTools } from "./crm-tools.js";

const context: CurrentBusinessUser = { authUserId: "auth", userId: "user", organizationId: "trusted-tenant", role: "OWNER" };
describe("deterministic CRM count tools", () => {
  it("uses tenant-scoped count service ports rather than search-page lengths", async () => {
    const customerCount = vi.fn(async () => 123);
    const newCount = vi.fn(async () => 37);
    const registry = createCrmSummaryTools(new CrmDashboardService(
      { countActive: customerCount },
      { countOpen: async () => 42, recentNew: async () => [] },
      { countActive: async () => 7 },
    ), new LeadSummaryService({ countNew: newCount }));
    expect(await registry["customers.countActive"]!.execute({ ...context, correlationId: "test" }, {})).toEqual({ success: true, data: 123 });
    expect(await registry["leads.countNew"]!.execute({ ...context, correlationId: "test" }, {})).toEqual({ success: true, data: 37 });
    expect(customerCount).toHaveBeenCalledWith("trusted-tenant");
    expect(newCount).toHaveBeenCalledWith("trusted-tenant");
    for (const role of ["ACCOUNTANT", "TECHNICIAN"] as const) {
      expect(await registry["leads.countNew"]!.execute({ ...context, role, correlationId: "test" }, {})).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    }
    expect(newCount).toHaveBeenCalledOnce();
    expect(Object.values(registry).every((entry) => entry.risk === 0)).toBe(true);
  });
});
