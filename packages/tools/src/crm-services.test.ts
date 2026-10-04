import type { CurrentBusinessUser, UserRole } from "@first-ai/auth";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError, CustomerService, LeadService, ServiceCatalogService } from "./crm-services.js";

const organizationAId = "ca9cfcfd-bdec-4bbf-a71d-2c0b39250ac2";
const organizationBId = "fbd76677-f964-45cb-84c4-4991cd56ee38";
const customerBId = "4018cbee-4c12-46e8-91cc-5ca27e47c44b";

function context(role: UserRole, organizationId = organizationAId): CurrentBusinessUser {
  return { authUserId: "1d2e5995-735b-49a6-9a48-c176b79bcdf5", userId: "ad298a35-35b3-4794-ac5d-9e76b73bb421", organizationId, role };
}

describe("CRM business services", () => {
  it.each(["OWNER", "ADMIN", "MANAGER"] as const)("allows %s to create customers with trusted tenant scope", async (role) => {
    const create = vi.fn(async (organizationId: string, input: object) => ({ id: "created", organizationId, ...input }));
    const repository = { create, get: vi.fn(), search: vi.fn(), update: vi.fn(), archive: vi.fn() } as unknown as ConstructorParameters<typeof CustomerService>[0];
    await new CustomerService(repository).createCustomer(context(role), { type: "company", name: "Fictional Customer" });
    expect(create).toHaveBeenCalledWith(organizationAId, expect.objectContaining({ name: "Fictional Customer" }));
  });

  it("rejects restricted CRM writes", async () => {
    const customerRepository = { create: vi.fn(), get: vi.fn(), search: vi.fn(), update: vi.fn(), archive: vi.fn() } as unknown as ConstructorParameters<typeof CustomerService>[0];
    const catalogRepository = { create: vi.fn(), get: vi.fn(), search: vi.fn(), update: vi.fn() } as unknown as ConstructorParameters<typeof ServiceCatalogService>[0];
    const leadRepository = { create: vi.fn(), get: vi.fn(), search: vi.fn(), update: vi.fn(), assignedUserExists: vi.fn() } as unknown as ConstructorParameters<typeof LeadService>[0];
    await expect(new CustomerService(customerRepository).createCustomer(context("READ_ONLY"), { type: "company", name: "No" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(new ServiceCatalogService(catalogRepository).createService(context("TECHNICIAN"), { code: "TEST", name: "Test", pricingMode: "fixed" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(new LeadService(leadRepository).createLead(context("ACCOUNTANT"), { companyName: "No" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("passes organization scope to reads and cannot retrieve a foreign UUID", async () => {
    const get = vi.fn(async ({ organizationId, customerId }: { organizationId: string; customerId: string }) => organizationId === organizationBId && customerId === customerBId ? { id: customerBId } : undefined);
    const repository = { get, create: vi.fn(), search: vi.fn(), update: vi.fn(), archive: vi.fn() } as unknown as ConstructorParameters<typeof CustomerService>[0];
    await expect(new CustomerService(repository).getCustomer(context("OWNER"), customerBId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(get).toHaveBeenCalledWith({ organizationId: organizationAId, customerId: customerBId });
  });

  it("allows operational read permissions", async () => {
    const search = vi.fn(async () => []);
    const repository = { search, get: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() } as unknown as ConstructorParameters<typeof CustomerService>[0];
    await expect(new CustomerService(repository).searchCustomers(context("ACCOUNTANT"), {})).resolves.toEqual([]);
  });
});
