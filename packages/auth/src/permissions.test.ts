import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions.js";
import { isUserRole } from "./roles.js";

describe("auth roles and permissions", () => {
  it("recognizes only the supported roles", () => {
    expect(isUserRole("OWNER")).toBe(true);
    expect(isUserRole("READ_ONLY")).toBe(true);
    expect(isUserRole("SUPER_ADMIN")).toBe(false);
  });

  it("applies the minimal permission map", () => {
    expect(hasPermission("OWNER", "users.read")).toBe(true);
    expect(hasPermission("TECHNICIAN", "users.read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "customers.read")).toBe(true);
  });

  it.each(["OWNER", "ADMIN", "MANAGER"] as const)("allows %s to write CRM records", (role) => {
    expect(hasPermission(role, "customers.write")).toBe(true);
    expect(hasPermission(role, "leads.write")).toBe(true);
    expect(hasPermission(role, "services.write")).toBe(true);
  });

  it("keeps restricted roles read-oriented", () => {
    expect(hasPermission("READ_ONLY", "customers.write")).toBe(false);
    expect(hasPermission("TECHNICIAN", "services.write")).toBe(false);
    expect(hasPermission("ACCOUNTANT", "leads.write")).toBe(false);
    expect(hasPermission("TECHNICIAN", "sites.read")).toBe(true);
    expect(hasPermission("ACCOUNTANT", "customers.read")).toBe(true);
  });
});
