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
});
