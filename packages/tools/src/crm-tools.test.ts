import { describe, expect, it } from "vitest";

import { createCrmToolRegistry } from "./crm-tools.js";

describe("CRM tool registry", () => {
  it("registers only the requested tools with declared risk and permissions", () => {
    const services = {} as Parameters<typeof createCrmToolRegistry>[0];
    const registry = createCrmToolRegistry(services);
    expect(Object.keys(registry).sort()).toEqual([
      "contacts.create", "contacts.get", "contacts.search",
      "customers.create", "customers.get", "customers.search",
      "leads.create", "leads.get", "leads.search",
      "services.get", "services.listActive", "services.search",
      "sites.create", "sites.get", "sites.search",
    ]);
    expect(registry["customers.get"]).toMatchObject({ risk: 0, permission: "customers.read" });
    expect(registry["customers.create"]).toMatchObject({ risk: 1, permission: "customers.write" });
  });

  it("does not accept organizationId as customer creation input", () => {
    const registry = createCrmToolRegistry({} as Parameters<typeof createCrmToolRegistry>[0]);
    const parsed = registry["customers.create"]!.inputSchema.parse({ organizationId: "fbd76677-f964-45cb-84c4-4991cd56ee38", type: "company", name: "Safe" });
    expect(parsed).not.toHaveProperty("organizationId");
  });
});
