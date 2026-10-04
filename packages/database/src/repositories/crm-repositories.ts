import type {
  CreateContactInput,
  CreateCustomerInput,
  CreateCustomerSiteInput,
  CreateLeadInput,
  CreateServiceInput,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateCustomerSiteInput,
  UpdateLeadInput,
  UpdateServiceInput,
} from "@first-ai/schemas";
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";

import type { createDatabaseClient } from "../client.js";
import { contacts, customers, customerSites, leads, services, users } from "../schema/index.js";

type Database = ReturnType<typeof createDatabaseClient>;
export interface Page { readonly limit: number; readonly offset: number }
export interface SearchPage extends Page { readonly query?: string }
export type Customer = typeof customers.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type CustomerSite = typeof customerSites.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type CatalogService = typeof services.$inferSelect;
export type AssignableUser = Pick<typeof users.$inferSelect, "id" | "firstName" | "lastName">;

function pageLimit(limit: number): number { return Math.min(Math.max(limit, 1), 100); }
function terms(base: SQL[], query: string | undefined, fields: SQL[]): SQL[] {
  if (query === undefined || query.trim().length === 0) return base;
  const match = or(...fields);
  return match === undefined ? base : [...base, match];
}

export class CustomerRepository {
  constructor(private readonly db: Database) {}
  async get(input: { organizationId: string; customerId: string }): Promise<Customer | undefined> {
    return this.db.query.customers.findFirst({ where: and(eq(customers.organizationId, input.organizationId), eq(customers.id, input.customerId), isNull(customers.deletedAt)) });
  }
  async search(input: SearchPage & { organizationId: string; status?: Customer["status"] }): Promise<Customer[]> {
    const q = input.query?.trim() ?? "";
    const conditions = terms([eq(customers.organizationId, input.organizationId), isNull(customers.deletedAt)], input.query, [ilike(customers.name, `%${q}%`), ilike(customers.siret, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.billingEmail, `%${q}%`)]);
    if (input.status !== undefined) conditions.push(eq(customers.status, input.status));
    return this.db.select().from(customers).where(and(...conditions)).limit(pageLimit(input.limit)).offset(input.offset).orderBy(customers.name);
  }
  async create(organizationId: string, input: CreateCustomerInput): Promise<Customer> {
    const [row] = await this.db.insert(customers).values({ organizationId, ...input }).returning();
    if (row === undefined) throw new Error("Customer creation failed."); return row;
  }
  async update(scope: { organizationId: string; customerId: string }, input: UpdateCustomerInput): Promise<Customer | undefined> {
    const [row] = await this.db.update(customers).set({ ...input, updatedAt: new Date() }).where(and(eq(customers.organizationId, scope.organizationId), eq(customers.id, scope.customerId), isNull(customers.deletedAt))).returning(); return row;
  }
  async archive(scope: { organizationId: string; customerId: string }): Promise<Customer | undefined> {
    const [row] = await this.db.update(customers).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(customers.organizationId, scope.organizationId), eq(customers.id, scope.customerId), isNull(customers.deletedAt))).returning(); return row;
  }
  async countActive(organizationId: string): Promise<number> {
    const [result] = await this.db.select({ value: count() }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.status, "active"), isNull(customers.deletedAt)));
    return result?.value ?? 0;
  }
}

export class ContactRepository {
  constructor(private readonly db: Database) {}
  async get(input: { organizationId: string; contactId: string }): Promise<Contact | undefined> { return this.db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId), isNull(contacts.deletedAt)) }); }
  async search(input: SearchPage & { organizationId: string; customerId?: string }): Promise<Contact[]> {
    const q = input.query?.trim() ?? ""; const conditions = terms([eq(contacts.organizationId, input.organizationId), isNull(contacts.deletedAt)], input.query, [ilike(contacts.firstName, `%${q}%`), ilike(contacts.lastName, `%${q}%`), ilike(contacts.email, `%${q}%`), ilike(contacts.phone, `%${q}%`)]);
    if (input.customerId !== undefined) conditions.push(eq(contacts.customerId, input.customerId));
    return this.db.select().from(contacts).where(and(...conditions)).limit(pageLimit(input.limit)).offset(input.offset).orderBy(contacts.lastName, contacts.firstName);
  }
  async create(organizationId: string, input: CreateContactInput): Promise<Contact> { const [row] = await this.db.insert(contacts).values({ organizationId, ...input }).returning(); if (row === undefined) throw new Error("Contact creation failed."); return row; }
  async update(scope: { organizationId: string; contactId: string }, input: UpdateContactInput): Promise<Contact | undefined> { const [row] = await this.db.update(contacts).set({ ...input, updatedAt: new Date() }).where(and(eq(contacts.organizationId, scope.organizationId), eq(contacts.id, scope.contactId), isNull(contacts.deletedAt))).returning(); return row; }
}

export class CustomerSiteRepository {
  constructor(private readonly db: Database) {}
  async get(input: { organizationId: string; customerSiteId: string }): Promise<CustomerSite | undefined> { return this.db.query.customerSites.findFirst({ where: and(eq(customerSites.organizationId, input.organizationId), eq(customerSites.id, input.customerSiteId), isNull(customerSites.deletedAt)) }); }
  async search(input: SearchPage & { organizationId: string; customerId?: string }): Promise<CustomerSite[]> { const q = input.query?.trim() ?? ""; const conditions = terms([eq(customerSites.organizationId, input.organizationId), isNull(customerSites.deletedAt)], input.query, [ilike(customerSites.name, `%${q}%`), ilike(customerSites.addressLine1, `%${q}%`), ilike(customerSites.city, `%${q}%`), ilike(customerSites.postalCode, `%${q}%`)]); if (input.customerId !== undefined) conditions.push(eq(customerSites.customerId, input.customerId)); return this.db.select().from(customerSites).where(and(...conditions)).limit(pageLimit(input.limit)).offset(input.offset).orderBy(customerSites.name); }
  async create(organizationId: string, input: CreateCustomerSiteInput): Promise<CustomerSite> { const [row] = await this.db.insert(customerSites).values({ organizationId, ...input, latitude: input.latitude?.toString(), longitude: input.longitude?.toString() }).returning(); if (row === undefined) throw new Error("Customer site creation failed."); return row; }
  async update(scope: { organizationId: string; customerSiteId: string }, input: UpdateCustomerSiteInput): Promise<CustomerSite | undefined> { const [row] = await this.db.update(customerSites).set({ ...input, latitude: input.latitude?.toString(), longitude: input.longitude?.toString(), updatedAt: new Date() }).where(and(eq(customerSites.organizationId, scope.organizationId), eq(customerSites.id, scope.customerSiteId), isNull(customerSites.deletedAt))).returning(); return row; }
}

export class LeadRepository {
  async countNew(organizationId: string): Promise<number> {
    const [result] = await this.db.select({ value: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), eq(leads.status, "new"), isNull(leads.deletedAt)));
    return result?.value ?? 0;
  }
  constructor(private readonly db: Database) {}
  async get(input: { organizationId: string; leadId: string }): Promise<Lead | undefined> { return this.db.query.leads.findFirst({ where: and(eq(leads.organizationId, input.organizationId), eq(leads.id, input.leadId), isNull(leads.deletedAt)) }); }
  async search(input: SearchPage & { organizationId: string; status?: Lead["status"] }): Promise<Lead[]> { const q = input.query?.trim() ?? ""; const conditions = terms([eq(leads.organizationId, input.organizationId), isNull(leads.deletedAt)], input.query, [ilike(leads.companyName, `%${q}%`), ilike(leads.firstName, `%${q}%`), ilike(leads.lastName, `%${q}%`), ilike(leads.email, `%${q}%`), ilike(leads.phone, `%${q}%`)]); if (input.status !== undefined) conditions.push(eq(leads.status, input.status)); return this.db.select().from(leads).where(and(...conditions)).limit(pageLimit(input.limit)).offset(input.offset).orderBy(leads.createdAt); }
  async create(organizationId: string, input: CreateLeadInput): Promise<Lead> { const [row] = await this.db.insert(leads).values({ organizationId, ...input }).returning(); if (row === undefined) throw new Error("Lead creation failed."); return row; }
  async update(scope: { organizationId: string; leadId: string }, input: UpdateLeadInput): Promise<Lead | undefined> { const [row] = await this.db.update(leads).set({ ...input, updatedAt: new Date() }).where(and(eq(leads.organizationId, scope.organizationId), eq(leads.id, scope.leadId), isNull(leads.deletedAt))).returning(); return row; }
  async assignedUserExists(organizationId: string, userId: string): Promise<boolean> { const row = await this.db.query.users.findFirst({ columns: { id: true }, where: and(eq(users.organizationId, organizationId), eq(users.id, userId), isNull(users.deletedAt)) }); return row !== undefined; }
  async listAssignableUsers(organizationId: string): Promise<AssignableUser[]> { return this.db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.organizationId, organizationId), eq(users.status, "active"), isNull(users.deletedAt))).orderBy(users.lastName, users.firstName); }
  async countOpen(organizationId: string): Promise<number> { const [result] = await this.db.select({ value: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), inArray(leads.status, ["new", "contacted", "qualified", "proposal"]), isNull(leads.deletedAt))); return result?.value ?? 0; }
  async recentNew(organizationId: string, limit: number): Promise<Lead[]> { return this.db.select().from(leads).where(and(eq(leads.organizationId, organizationId), eq(leads.status, "new"), isNull(leads.deletedAt))).orderBy(desc(leads.createdAt)).limit(Math.min(Math.max(limit, 1), 10)); }
}

export class ServiceRepository {
  constructor(private readonly db: Database) {}
  async get(input: { organizationId: string; serviceId: string }): Promise<CatalogService | undefined> { return this.db.query.services.findFirst({ where: and(eq(services.organizationId, input.organizationId), eq(services.id, input.serviceId), isNull(services.deletedAt)) }); }
  async search(input: SearchPage & { organizationId: string; active?: boolean }): Promise<CatalogService[]> { const q = input.query?.trim() ?? ""; const conditions = terms([eq(services.organizationId, input.organizationId), isNull(services.deletedAt)], input.query, [ilike(services.name, `%${q}%`), ilike(services.code, `%${q}%`), ilike(services.category, `%${q}%`)]); if (input.active !== undefined) conditions.push(eq(services.active, input.active)); return this.db.select().from(services).where(and(...conditions)).limit(pageLimit(input.limit)).offset(input.offset).orderBy(services.name); }
  async create(organizationId: string, input: CreateServiceInput): Promise<CatalogService> { const [row] = await this.db.insert(services).values({ organizationId, ...input }).returning(); if (row === undefined) throw new Error("Service creation failed."); return row; }
  async update(scope: { organizationId: string; serviceId: string }, input: UpdateServiceInput): Promise<CatalogService | undefined> { const [row] = await this.db.update(services).set({ ...input, updatedAt: new Date() }).where(and(eq(services.organizationId, scope.organizationId), eq(services.id, scope.serviceId), isNull(services.deletedAt))).returning(); return row; }
  async countActive(organizationId: string): Promise<number> { const [result] = await this.db.select({ value: count() }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.active, true), isNull(services.deletedAt))); return result?.value ?? 0; }
}

// Service-layer ports are structural so deterministic test doubles do not need a database.
export type CustomerRepositoryInterface = Pick<CustomerRepository, "get" | "search" | "create" | "update" | "archive" | "countActive">;
export type ContactRepositoryInterface = Pick<ContactRepository, "get" | "search" | "create" | "update">;
export type CustomerSiteRepositoryInterface = Pick<CustomerSiteRepository, "get" | "search" | "create" | "update">;
export type LeadRepositoryInterface = Pick<LeadRepository, "get" | "search" | "create" | "update" | "assignedUserExists" | "listAssignableUsers" | "countOpen" | "recentNew">;
export type ServiceRepositoryInterface = Pick<ServiceRepository, "get" | "search" | "create" | "update" | "countActive">;
