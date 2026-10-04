import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "../client.js";
import { customers, organizations } from "../schema/index.js";
import { CustomerRepository } from "./crm-repositories.js";

function assertLocalDatabase(): void {
  const value = process.env.DATABASE_URL;
  if (value === undefined) throw new Error("DATABASE_URL is required.");
  const host = new URL(value).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`Integration tests refuse non-local database host: ${host}`);
}

describe("privileged CRM repository tenant scope", () => {
  const db = createDatabaseClient();
  const repository = new CustomerRepository(db);
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const customerAId = randomUUID();
  const customerBId = randomUUID();

  beforeAll(async () => {
    assertLocalDatabase();
    await db.insert(organizations).values([{ id: organizationAId, name: "Repository Organization A" }, { id: organizationBId, name: "Repository Organization B" }]);
    await db.insert(customers).values([{ id: customerAId, organizationId: organizationAId, type: "company", name: "Repository Customer A" }, { id: customerBId, organizationId: organizationBId, type: "company", name: "Repository Customer B" }]);
  });

  afterAll(async () => {
    await db.delete(customers).where(inArray(customers.id, [customerAId, customerBId]));
    await db.delete(organizations).where(inArray(organizations.id, [organizationAId, organizationBId]));
    await db.$client.end();
  });

  it("does not return another tenant by exact UUID through a privileged connection", async () => {
    await expect(repository.get({ organizationId: organizationAId, customerId: customerAId })).resolves.toMatchObject({ id: customerAId });
    await expect(repository.get({ organizationId: organizationAId, customerId: customerBId })).resolves.toBeUndefined();
  });
});
