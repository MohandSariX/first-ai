import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  contacts,
  customerSites,
  customers,
  leads,
  organizations,
  services,
  users,
} from "./index.js";

describe("database schema exports", () => {
  it("exports the current application tables", () => {
    expect([
      getTableName(organizations),
      getTableName(users),
      getTableName(customers),
      getTableName(contacts),
      getTableName(customerSites),
      getTableName(leads),
      getTableName(services),
    ]).toEqual([
      "organizations",
      "users",
      "customers",
      "contacts",
      "customer_sites",
      "leads",
      "services",
    ]);
  });

  it("keeps organization scope mandatory on tenant-owned tables", () => {
    expect(users.organizationId.notNull).toBe(true);
    expect(customers.organizationId.notNull).toBe(true);
    expect(contacts.organizationId.notNull).toBe(true);
    expect(customerSites.organizationId.notNull).toBe(true);
    expect(leads.organizationId.notNull).toBe(true);
    expect(services.organizationId.notNull).toBe(true);
  });
});
