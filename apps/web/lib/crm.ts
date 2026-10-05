import "server-only";

import {
  ContactRepository,
  createDatabaseClient,
  CustomerRepository,
  CustomerSiteRepository,
  LeadRepository,
  ServiceRepository,
  OperationalStore,
  InvoiceStore,
  PaymentStore,
} from "@first-ai/database";
import {
  ContactService,
  CrmDashboardService,
  CustomerService,
  CustomerSiteService,
  LeadService,
  LeadSummaryService,
  ServiceCatalogService,
  QuoteService, JobService, JobReportService,
  InvoiceService,
  PaymentService,
  BillingIdentityService,
} from "@first-ai/tools";

import { requireBusinessUser } from "./auth";
import type { CurrentBusinessUser } from "@first-ai/auth";

export async function withCrm<T>(operation: (crm: Awaited<ReturnType<typeof createCrm>>) => Promise<T>): Promise<T> {
  const crm = await createCrm();
  try { return await operation(crm); } finally { await crm.database.$client.end(); }
}

export async function createCrm(providedContext?: CurrentBusinessUser) {
  const context = providedContext ?? await requireBusinessUser();
  const database = createDatabaseClient();
  const customersRepository = new CustomerRepository(database);
  const contactsRepository = new ContactRepository(database);
  const sitesRepository = new CustomerSiteRepository(database);
  const leadsRepository = new LeadRepository(database);
  const servicesRepository = new ServiceRepository(database);
  const operationalStore = new OperationalStore(database);
  return {
    context,
    database,
    customers: new CustomerService(customersRepository),
    contacts: new ContactService(contactsRepository, customersRepository),
    sites: new CustomerSiteService(sitesRepository, customersRepository, contactsRepository),
    leads: new LeadService(leadsRepository),
    catalog: new ServiceCatalogService(servicesRepository),
    dashboard: new CrmDashboardService(customersRepository, leadsRepository, servicesRepository),
    leadSummary: new LeadSummaryService(leadsRepository),
    quotes: new QuoteService(operationalStore),
    jobs: new JobService(operationalStore),
    reports: new JobReportService(operationalStore),
    invoices: new InvoiceService(new InvoiceStore(database)),
    payments: new PaymentService(new PaymentStore(database)),
    billing: new BillingIdentityService(new InvoiceStore(database)),
  };
}
