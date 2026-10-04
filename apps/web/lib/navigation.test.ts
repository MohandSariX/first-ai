import { describe, expect, it } from "vitest";

import { getNavigationItems } from "./navigation";

describe("permission-aware navigation", () => {
  it("shows all CRM sections to a manager", () => {
    expect(getNavigationItems("MANAGER").map((item) => item.href)).toEqual(["/assistant", "/dashboard", "/customers", "/leads", "/services"]);
  });
  it("hides prospects from roles without lead read access", () => {
    expect(getNavigationItems("TECHNICIAN").map((item) => item.href)).toEqual(["/assistant", "/dashboard", "/customers", "/services"]);
    expect(getNavigationItems("ACCOUNTANT").some((item) => item.href === "/leads")).toBe(false);
  });
  it("keeps all sections visible but read-only for READ_ONLY", () => {
    expect(getNavigationItems("READ_ONLY")).toHaveLength(5);
  });
});
