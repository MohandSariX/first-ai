import "server-only";

import {
  ContactRepository,
  createDatabaseClient,
  CustomerRepository,
  CustomerSiteRepository,
  LeadRepository,
  ServiceRepository,
} from "@first-ai/database";
import {
  ContactService,
  CrmDashboardService,
  CustomerService,
  CustomerSiteService,
  LeadService,
  ServiceCatalogService,
} from "@first-ai/tools";

import { requireBusinessUser } from "./auth";

export async function withCrm<T>(operation: (crm: Awaited<ReturnType<typeof createCrm>>) => Promise<T>): Promise<T> {
  const crm = await createCrm();
  try { return await operation(crm); } finally { await crm.database.$client.end(); }
}

async function createCrm() {
  const context = await requireBusinessUser();
  const database = createDatabaseClient();
  const customersRepository = new CustomerRepository(database);
  const contactsRepository = new ContactRepository(database);
  const sitesRepository = new CustomerSiteRepository(database);
  const leadsRepository = new LeadRepository(database);
  const servicesRepository = new ServiceRepository(database);
  return {
    context,
    database,
    customers: new CustomerService(customersRepository),
    contacts: new ContactService(contactsRepository, customersRepository),
    sites: new CustomerSiteService(sitesRepository, customersRepository, contactsRepository),
    leads: new LeadService(leadsRepository),
    catalog: new ServiceCatalogService(servicesRepository),
    dashboard: new CrmDashboardService(customersRepository, leadsRepository, servicesRepository),
  };
}
