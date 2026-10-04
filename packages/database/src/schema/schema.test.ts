import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  contacts,
  customerSites,
  customers,
  organizations,
  users,
} from "./index.js";

describe("database schema exports", () => {
  it("exports exactly the requested MVP tables", () => {
    expect([
      getTableName(organizations),
      getTableName(users),
      getTableName(customers),
      getTableName(contacts),
      getTableName(customerSites),
    ]).toEqual([
      "organizations",
      "users",
      "customers",
      "contacts",
      "customer_sites",
    ]);
  });

  it("keeps organization scope mandatory on tenant-owned tables", () => {
    expect(users.organizationId.notNull).toBe(true);
    expect(customers.organizationId.notNull).toBe(true);
    expect(contacts.organizationId.notNull).toBe(true);
    expect(customerSites.organizationId.notNull).toBe(true);
  });
});
