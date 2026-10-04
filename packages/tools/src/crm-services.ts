import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type {
  ContactRepository,
  CustomerRepository,
  CustomerSiteRepository,
  LeadRepository,
  ServiceRepository,
} from "@first-ai/database";
import {
  assignLeadSchema,
  contactSearchSchema,
  createContactSchema,
  createCustomerSchema,
  createCustomerSiteSchema,
  createLeadSchema,
  createServiceSchema,
  customerSearchSchema,
  customerSiteSearchSchema,
  leadSearchSchema,
  serviceSearchSchema,
  updateContactSchema,
  updateCustomerSchema,
  updateCustomerSiteSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  updateServiceSchema,
} from "@first-ai/schemas";

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
}
export class ResourceNotFoundError extends Error {
  readonly code = "NOT_FOUND";
}

function authorize(context: CurrentBusinessUser, permission: Permission): void {
  if (!hasPermission(context.role, permission)) throw new AuthorizationError(`Permission ${permission} is required.`);
}
function found<T>(value: T | undefined, resource: string): T {
  if (value === undefined) throw new ResourceNotFoundError(`${resource} not found.`); return value;
}

type Customers = Pick<CustomerRepository, "get" | "search" | "create" | "update" | "archive">;
type Contacts = Pick<ContactRepository, "get" | "search" | "create" | "update">;
type Sites = Pick<CustomerSiteRepository, "get" | "search" | "create" | "update">;
type Leads = Pick<LeadRepository, "get" | "search" | "create" | "update" | "assignedUserExists">;
type Catalog = Pick<ServiceRepository, "get" | "search" | "create" | "update">;

export class CustomerService {
  constructor(private readonly repository: Customers) {}
  async getCustomer(context: CurrentBusinessUser, customerId: string) { authorize(context, "customers.read"); return found(await this.repository.get({ organizationId: context.organizationId, customerId }), "Customer"); }
  async searchCustomers(context: CurrentBusinessUser, input: unknown) { authorize(context, "customers.read"); return this.repository.search({ organizationId: context.organizationId, ...customerSearchSchema.parse(input) }); }
  async createCustomer(context: CurrentBusinessUser, input: unknown) { authorize(context, "customers.write"); return this.repository.create(context.organizationId, createCustomerSchema.parse(input)); }
  async updateCustomer(context: CurrentBusinessUser, customerId: string, input: unknown) { authorize(context, "customers.write"); return found(await this.repository.update({ organizationId: context.organizationId, customerId }, updateCustomerSchema.parse(input)), "Customer"); }
  async archiveCustomer(context: CurrentBusinessUser, customerId: string) { authorize(context, "customers.write"); return found(await this.repository.archive({ organizationId: context.organizationId, customerId }), "Customer"); }
}

export class ContactService {
  constructor(private readonly repository: Contacts, private readonly customers: Pick<CustomerRepository, "get">) {}
  async getContact(context: CurrentBusinessUser, contactId: string) { authorize(context, "contacts.read"); return found(await this.repository.get({ organizationId: context.organizationId, contactId }), "Contact"); }
  async searchContacts(context: CurrentBusinessUser, input: unknown) { authorize(context, "contacts.read"); return this.repository.search({ organizationId: context.organizationId, ...contactSearchSchema.parse(input) }); }
  async createContact(context: CurrentBusinessUser, input: unknown) { authorize(context, "contacts.write"); const parsed = createContactSchema.parse(input); found(await this.customers.get({ organizationId: context.organizationId, customerId: parsed.customerId }), "Customer"); return this.repository.create(context.organizationId, parsed); }
  async updateContact(context: CurrentBusinessUser, contactId: string, input: unknown) { authorize(context, "contacts.write"); return found(await this.repository.update({ organizationId: context.organizationId, contactId }, updateContactSchema.parse(input)), "Contact"); }
}

export class CustomerSiteService {
  constructor(private readonly repository: Sites, private readonly customers: Pick<CustomerRepository, "get">, private readonly contacts: Pick<ContactRepository, "get">) {}
  async getCustomerSite(context: CurrentBusinessUser, customerSiteId: string) { authorize(context, "sites.read"); return found(await this.repository.get({ organizationId: context.organizationId, customerSiteId }), "Customer site"); }
  async searchCustomerSites(context: CurrentBusinessUser, input: unknown) { authorize(context, "sites.read"); return this.repository.search({ organizationId: context.organizationId, ...customerSiteSearchSchema.parse(input) }); }
  async createCustomerSite(context: CurrentBusinessUser, input: unknown) { authorize(context, "sites.write"); const parsed = createCustomerSiteSchema.parse(input); found(await this.customers.get({ organizationId: context.organizationId, customerId: parsed.customerId }), "Customer"); if (parsed.primaryContactId !== undefined && parsed.primaryContactId !== null) { const contact = found(await this.contacts.get({ organizationId: context.organizationId, contactId: parsed.primaryContactId }), "Primary contact"); if (contact.customerId !== parsed.customerId) throw new ResourceNotFoundError("Primary contact does not belong to this customer."); } return this.repository.create(context.organizationId, parsed); }
  async updateCustomerSite(context: CurrentBusinessUser, customerSiteId: string, input: unknown) { authorize(context, "sites.write"); const parsed = updateCustomerSiteSchema.parse(input); if (parsed.primaryContactId !== undefined && parsed.primaryContactId !== null) { const site = found(await this.repository.get({ organizationId: context.organizationId, customerSiteId }), "Customer site"); const contact = found(await this.contacts.get({ organizationId: context.organizationId, contactId: parsed.primaryContactId }), "Primary contact"); if (contact.customerId !== site.customerId) throw new ResourceNotFoundError("Primary contact does not belong to this customer."); } return found(await this.repository.update({ organizationId: context.organizationId, customerSiteId }, parsed), "Customer site"); }
}

export class LeadService {
  constructor(private readonly repository: Leads) {}
  async getLead(context: CurrentBusinessUser, leadId: string) { authorize(context, "leads.read"); return found(await this.repository.get({ organizationId: context.organizationId, leadId }), "Lead"); }
  async searchLeads(context: CurrentBusinessUser, input: unknown) { authorize(context, "leads.read"); return this.repository.search({ organizationId: context.organizationId, ...leadSearchSchema.parse(input) }); }
  async createLead(context: CurrentBusinessUser, input: unknown) { authorize(context, "leads.write"); const parsed = createLeadSchema.parse(input); await this.validateAssignee(context.organizationId, parsed.assignedUserId); return this.repository.create(context.organizationId, parsed); }
  async updateLead(context: CurrentBusinessUser, leadId: string, input: unknown) { authorize(context, "leads.write"); const parsed = updateLeadSchema.parse(input); await this.validateAssignee(context.organizationId, parsed.assignedUserId); return found(await this.repository.update({ organizationId: context.organizationId, leadId }, parsed), "Lead"); }
  async updateLeadStatus(context: CurrentBusinessUser, leadId: string, input: unknown) { return this.updateLead(context, leadId, updateLeadStatusSchema.parse(input)); }
  async assignLead(context: CurrentBusinessUser, leadId: string, input: unknown) { return this.updateLead(context, leadId, assignLeadSchema.parse(input)); }
  private async validateAssignee(organizationId: string, userId: string | null | undefined) { if (userId !== undefined && userId !== null && !(await this.repository.assignedUserExists(organizationId, userId))) throw new ResourceNotFoundError("Assigned user not found."); }
}

export class ServiceCatalogService {
  constructor(private readonly repository: Catalog) {}
  async getService(context: CurrentBusinessUser, serviceId: string) { authorize(context, "services.read"); return found(await this.repository.get({ organizationId: context.organizationId, serviceId }), "Service"); }
  async listServices(context: CurrentBusinessUser, input: unknown = {}) { authorize(context, "services.read"); return this.repository.search({ organizationId: context.organizationId, ...serviceSearchSchema.parse(input) }); }
  async searchServices(context: CurrentBusinessUser, input: unknown) { return this.listServices(context, input); }
  async createService(context: CurrentBusinessUser, input: unknown) { authorize(context, "services.write"); return this.repository.create(context.organizationId, createServiceSchema.parse(input)); }
  async updateService(context: CurrentBusinessUser, serviceId: string, input: unknown) { authorize(context, "services.write"); return found(await this.repository.update({ organizationId: context.organizationId, serviceId }, updateServiceSchema.parse(input)), "Service"); }
}
