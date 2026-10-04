import type { CurrentBusinessUser, Permission } from "@first-ai/auth";
import {
  contactSearchSchema,
  createContactSchema,
  createCustomerSchema,
  createCustomerSiteSchema,
  createLeadSchema,
  customerSearchSchema,
  customerSiteSearchSchema,
  leadSearchSchema,
  serviceSearchSchema,
} from "@first-ai/schemas";
import { z } from "zod";

import type { ContactService, CrmDashboardService, CustomerService, CustomerSiteService, LeadService, LeadSummaryService, ServiceCatalogService } from "./crm-services.js";

export interface ToolContext extends CurrentBusinessUser {
  readonly correlationId: string;
  readonly agentId?: string;
  readonly agentRunId?: string;
}
export type ToolRisk = 0 | 1;
export type ToolResult<T> = { readonly success: true; readonly data: T } | { readonly success: false; readonly error: { readonly code: string; readonly message: string } };
export interface Tool<T = unknown> {
  readonly name: string;
  readonly description: string;
  readonly risk: ToolRisk;
  readonly permission: Permission;
  readonly inputSchema: z.ZodType;
  execute(context: ToolContext, input: unknown): Promise<ToolResult<T>>;
}
type Services = { customers: CustomerService; contacts: ContactService; sites: CustomerSiteService; leads: LeadService; catalog: ServiceCatalogService };

function tool<T>(definition: Omit<Tool<T>, "execute"> & { run(context: ToolContext, input: unknown): Promise<T> }): Tool<T> {
  return { ...definition, async execute(context, input) { try { const parsed = definition.inputSchema.parse(input); return { success: true, data: await definition.run(context, parsed) }; } catch (error: unknown) { const value = error as { code?: string; message?: string }; return { success: false, error: { code: value.code ?? (error instanceof z.ZodError ? "VALIDATION_ERROR" : "INTERNAL_ERROR"), message: value.message ?? "Tool execution failed." } }; } } };
}

export function createCrmToolRegistry(services: Services): Readonly<Record<string, Tool>> {
  const id = (key: string) => z.object({ [key]: z.uuid() });
  const registry: Tool[] = [
    tool({ name: "customers.get", description: "Get one customer in the current organization.", risk: 0, permission: "customers.read", inputSchema: id("customerId"), run: (c, i) => services.customers.getCustomer(c, (i as { customerId: string }).customerId) }),
    tool({ name: "customers.search", description: "Search customers in the current organization.", risk: 0, permission: "customers.read", inputSchema: customerSearchSchema, run: (c, i) => services.customers.searchCustomers(c, i) }),
    tool({ name: "customers.create", description: "Create a customer in the current organization.", risk: 1, permission: "customers.write", inputSchema: createCustomerSchema, run: (c, i) => services.customers.createCustomer(c, i) }),
    tool({ name: "contacts.get", description: "Get one contact in the current organization.", risk: 0, permission: "contacts.read", inputSchema: id("contactId"), run: (c, i) => services.contacts.getContact(c, (i as { contactId: string }).contactId) }),
    tool({ name: "contacts.search", description: "Search contacts in the current organization.", risk: 0, permission: "contacts.read", inputSchema: contactSearchSchema, run: (c, i) => services.contacts.searchContacts(c, i) }),
    tool({ name: "contacts.create", description: "Create a customer contact.", risk: 1, permission: "contacts.write", inputSchema: createContactSchema, run: (c, i) => services.contacts.createContact(c, i) }),
    tool({ name: "sites.get", description: "Get one customer site in the current organization.", risk: 0, permission: "sites.read", inputSchema: id("customerSiteId"), run: (c, i) => services.sites.getCustomerSite(c, (i as { customerSiteId: string }).customerSiteId) }),
    tool({ name: "sites.search", description: "Search customer sites in the current organization.", risk: 0, permission: "sites.read", inputSchema: customerSiteSearchSchema, run: (c, i) => services.sites.searchCustomerSites(c, i) }),
    tool({ name: "sites.create", description: "Create a customer site.", risk: 1, permission: "sites.write", inputSchema: createCustomerSiteSchema, run: (c, i) => services.sites.createCustomerSite(c, i) }),
    tool({ name: "leads.get", description: "Get one lead in the current organization.", risk: 0, permission: "leads.read", inputSchema: id("leadId"), run: (c, i) => services.leads.getLead(c, (i as { leadId: string }).leadId) }),
    tool({ name: "leads.search", description: "Search leads in the current organization.", risk: 0, permission: "leads.read", inputSchema: leadSearchSchema, run: (c, i) => services.leads.searchLeads(c, i) }),
    tool({ name: "leads.create", description: "Create a lead in the current organization.", risk: 1, permission: "leads.write", inputSchema: createLeadSchema, run: (c, i) => services.leads.createLead(c, i) }),
    tool({ name: "services.get", description: "Get one service in the current organization.", risk: 0, permission: "services.read", inputSchema: id("serviceId"), run: (c, i) => services.catalog.getService(c, (i as { serviceId: string }).serviceId) }),
    tool({ name: "services.search", description: "Search the service catalog.", risk: 0, permission: "services.read", inputSchema: serviceSearchSchema, run: (c, i) => services.catalog.searchServices(c, i) }),
    tool({ name: "services.listActive", description: "List a bounded page of active services in the current organization.", risk: 0, permission: "services.read", inputSchema: serviceSearchSchema.omit({ query: true, active: true }), run: (c, i) => services.catalog.listServices(c, { ...(i as { limit: number; offset: number }), active: true }) }),
  ];
  return Object.fromEntries(registry.map((entry) => [entry.name, entry]));
}

// Counts must come from SQL aggregates, never from one page of search results.
export function createCrmSummaryTools(dashboard: CrmDashboardService, leads: LeadSummaryService): Readonly<Record<string, Tool>> {
  const definitions: Tool[] = [
    tool({ name: "customers.countActive", description: "Exact count of active non-archived customers.", risk: 0, permission: "customers.read", inputSchema: z.strictObject({}), run: (c) => dashboard.countActiveCustomers(c) }),
    tool({ name: "leads.countOpen", description: "Exact count of open leads (new, contacted, qualified, proposal).", risk: 0, permission: "leads.read", inputSchema: z.strictObject({}), run: (c) => dashboard.countOpenLeads(c) }),
    tool({ name: "leads.countNew", description: "Exact count of new leads.", risk: 0, permission: "leads.read", inputSchema: z.strictObject({}), run: (c) => leads.countNew(c) }),
    tool({ name: "leads.recentNew", description: "The five most recent new leads requiring first contact; not an exhaustive list.", risk: 0, permission: "leads.read", inputSchema: z.strictObject({}), run: (c) => dashboard.recentNewLeads(c) }),
    tool({ name: "services.countActive", description: "Exact count of active non-archived services.", risk: 0, permission: "services.read", inputSchema: z.strictObject({}), run: (c) => dashboard.countActiveServices(c) }),
  ];
  return Object.fromEntries(definitions.map((definition) => [definition.name, definition]));
}
