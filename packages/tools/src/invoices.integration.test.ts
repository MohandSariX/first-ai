import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CurrentBusinessUser } from "@first-ai/auth";
import { and, eq } from "drizzle-orm";
import { createDatabaseClient, customers, customerSites, invoices, invoiceItems, InvoiceStore, jobs, organizations, quotes, services, users } from "@first-ai/database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { InvoiceService } from "./invoice-service.js";
import { createInvoiceToolRegistry } from "./invoice-tools.js";

describe("local invoice foundation", () => {
  const orgs = [randomUUID(), randomUUID()], customerIds = [randomUUID(), randomUUID()], userIds = [randomUUID(), randomUUID()], authIds: string[] = [];
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  let db: ReturnType<typeof createDatabaseClient>, service: InvoiceService, store: InvoiceStore, admin: SupabaseClient;
  const clients: SupabaseClient[] = [], contexts: CurrentBusinessUser[] = [], created: string[] = [], sourceQuotes: string[] = [], sourceJobs: string[] = [], sourceServices: string[] = [];
  const draft = (customerId: string) => ({ customerId, issueDate: "2026-10-05", dueDate: "2026-11-05" });
  beforeAll(async () => {
    for (const name of ["DATABASE_URL", "SUPABASE_URL"]) if (!["localhost", "127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname)) throw new Error("Invoice integration refuses non-local configuration.");
    admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, clientOptions);
    db = createDatabaseClient(); store = new InvoiceStore(db); service = new InvoiceService(store);
    for (let n = 0; n < 2; n++) {
      const email = `invoice-${orgs[n]}@example.test`, password = `Fictional-${randomUUID()}`;
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error; authIds.push(result.data.user.id);
      await db.insert(organizations).values({ id: orgs[n]!, name: `Fictional invoice tenant ${n}` });
      await db.insert(users).values({ id: userIds[n]!, organizationId: orgs[n]!, authUserId: authIds[n]!, firstName: "Fictional", lastName: "Invoice owner", email, role: "OWNER" });
      await db.insert(customers).values({ id: customerIds[n]!, organizationId: orgs[n]!, type: "company", name: `Fictional invoice customer ${n}` });
      const site = randomUUID(), catalog = randomUUID(), quote = randomUUID(), job = randomUUID();
      sourceQuotes.push(quote); sourceJobs.push(job); sourceServices.push(catalog);
      await db.insert(customerSites).values({ id: site, organizationId: orgs[n]!, customerId: customerIds[n]!, name: "Fictional site", addressLine1: "1 Test Street", postalCode: "75001", city: "Paris" });
      await db.insert(services).values({ id: catalog, organizationId: orgs[n]!, code: "INVOICE-TEST", name: "Fictional service", pricingMode: "fixed" });
      await db.insert(quotes).values({ id: quote, organizationId: orgs[n]!, customerId: customerIds[n]!, siteId: site, quoteNumber: "TEST-QUOTE", status: "accepted", createdByUserId: userIds[n]! });
      await db.insert(jobs).values({ id: job, organizationId: orgs[n]!, customerId: customerIds[n]!, siteId: site, quoteId: quote, serviceId: catalog, description: "Fictional completed source", status: "completed", createdByUserId: userIds[n]! });
      contexts.push({ organizationId: orgs[n]!, userId: userIds[n]!, authUserId: authIds[n]!, role: "OWNER" });
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions); const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error; clients.push(client);
      created.push((await service.createDraftInvoice(contexts[n]!, draft(customerIds[n]!))).id);
      await service.addInvoiceItem(contexts[n]!, created[n]!, { description: "Fictional invoice item", quantity: "2", unitPrice: "100.10", taxRate: "20" });
    }
  });
  afterAll(async () => {
    const errors: unknown[] = [];
    async function clean(operation: PromiseLike<unknown>) { try { await operation; } catch (error) { errors.push(error); } }
    if (db) {
      for (const org of orgs) { for (const table of [invoiceItems, invoices, jobs, quotes, customerSites, services, customers, users]) await clean(db.delete(table).where(eq(table.organizationId, org))); await clean(db.delete(organizations).where(eq(organizations.id, org))); }
      await clean(db.$client.end());
    }
    if (admin) for (const id of authIds) { const result = await admin.auth.admin.deleteUser(id); if (result.error) errors.push(result.error); }
    if (errors.length) throw new AggregateError(errors, "Invoice fixture cleanup failed.");
  });
  it("allocates consecutive invoice numbers safely under concurrency", async () => {
    const rows = await Promise.all([service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!)), service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!))]);
    expect(rows.map(r => r.invoiceNumber).sort()).toEqual(["FAC-2026-000002", "FAC-2026-000003"]);
    expect((await service.getInvoice(contexts[1]!, created[1]!)).invoiceNumber).toBe("FAC-2026-000001");
  });
  it("protects list and exact UUID reads symmetrically with actual authenticated RLS", async () => {
    for (let n = 0; n < 2; n++) for (const table of ["invoices", "invoice_items"]) {
      const list = await clients[n]!.from(table).select("id, organization_id"); expect(list.error).toBeNull(); expect(list.data!.length).toBeGreaterThan(0); expect(list.data!.every(r => r.organization_id === orgs[n])).toBe(true);
      const foreign = await clients[n]!.from(table).select("id").eq(table === "invoices" ? "id" : "invoice_id", created[1 - n]!); expect(foreign.error).toBeNull(); expect(foreign.data).toEqual([]);
    }
    expect((await admin.from("invoices").select("id").in("id", created)).data).toHaveLength(2);
  });
  it("denies anonymous reads and direct authenticated writes", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
    for (const table of ["invoices", "invoice_items"]) { const result = await anon.from(table).select("id"); expect(result.error).toBeNull(); expect(result.data).toEqual([]); }
    expect((await clients[0]!.from("invoices").update({ status: "cancelled" }).eq("id", created[0]!).select("id")).data).toEqual([]);
  });
  it("blocks technician RLS and inactive/deleted memberships despite a valid JWT", async () => {
    try {
      for (const patch of [{ role: "TECHNICIAN" as const }, { role: "OWNER" as const, status: "inactive" }, { status: "active", deletedAt: new Date() }]) {
        await db.update(users).set(patch).where(eq(users.id, userIds[0]!));
        for (const table of ["invoices", "invoice_items"]) expect((await clients[0]!.from(table).select("id").eq("organization_id", orgs[0]!)).data).toEqual([]);
      }
      await db.update(users).set({ role: "ACCOUNTANT", status: "active", deletedAt: null }).where(eq(users.id, userIds[0]!));
      expect((await clients[0]!.from("invoices").select("id").eq("id", created[0]!)).data).toHaveLength(1);
    } finally { await db.update(users).set({ role: "OWNER", status: "active", deletedAt: null }).where(eq(users.id, userIds[0]!)); }
  });
  it("scopes privileged repositories and item mutations even for known foreign UUIDs", async () => {
    await expect(service.getInvoice(contexts[0]!, created[1]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await store.invoices.update({ organizationId: orgs[0]!, invoiceId: created[1]! }, { status: "cancelled" })).toBeUndefined();
    const foreignItem = (await service.getInvoice(contexts[1]!, created[1]!)).items[0]!;
    await expect(service.updateInvoiceItem(contexts[0]!, created[0]!, foreignItem.id, { unitPrice: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const registry = createInvoiceToolRegistry(service), toolContext = { ...contexts[0]!, correlationId: randomUUID() };
    expect(Object.keys(registry)).toEqual(["invoices.get", "invoices.search"]); expect(Object.values(registry).every(t => t.risk === 0)).toBe(true);
    expect(await registry["invoices.get"]!.execute(toolContext, { invoiceId: created[1]! })).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    expect(await registry["invoices.get"]!.execute({ ...toolContext, role: "TECHNICIAN" }, { invoiceId: created[0]! })).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    expect(await registry["invoices.search"]!.execute(toolContext, { organizationId: orgs[1]! })).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.searchInvoices(contexts[0]!, {})).toEqual(expect.arrayContaining([expect.objectContaining({ invoice: expect.objectContaining({ organizationId: orgs[0]! }) })]));
  });
  it("rejects cross-tenant customer, quote, job and service relations in PostgreSQL", async () => {
    for (const extra of [{ customerId: customerIds[1]! }, { quoteId: sourceQuotes[1]! }, { jobId: sourceJobs[1]! }]) await expect(db.insert(invoices).values({ organizationId: orgs[0]!, createdByUserId: userIds[0]!, ...draft(customerIds[0]!), invoiceNumber: `INVALID-${randomUUID().slice(0, 16)}`, ...extra })).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(db.insert(invoiceItems).values({ organizationId: orgs[0]!, invoiceId: created[0]!, serviceId: sourceServices[1]!, description: "Invalid", quantity: "1", unitPrice: "1", taxRate: "20" })).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(db.insert(invoiceItems).values({ organizationId: orgs[0]!, invoiceId: created[1]!, description: "Invalid parent", quantity: "1", unitPrice: "1", taxRate: "20" })).rejects.toMatchObject({ cause: { code: "23503" } });
  });
  it("rolls back item and totals together on overflow and synchronizes edit/remove", async () => {
    const invoice = await service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!));
    await expect(service.addInvoiceItem(contexts[0]!, invoice.id, { description: "Overflow", quantity: "999999", unitPrice: "9999999999.99", taxRate: "20" })).rejects.toThrow();
    expect(await service.getInvoice(contexts[0]!, invoice.id)).toMatchObject({ items: [], total: "0.00" });
    const item = await service.addInvoiceItem(contexts[0]!, invoice.id, { description: "Line", quantity: "1", unitPrice: "10", taxRate: "20" });
    await service.updateInvoiceItem(contexts[0]!, invoice.id, item.id, { quantity: "3" }); expect((await service.getInvoice(contexts[0]!, invoice.id)).total).toBe("36.00");
    await service.removeInvoiceItem(contexts[0]!, invoice.id, item.id); expect((await service.getInvoice(contexts[0]!, invoice.id)).total).toBe("0.00");
  });
  it("requires a nonempty draft and issues once, then forbids modification/cancellation", async () => {
    const empty = await service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!)); await expect(service.issueInvoice(contexts[0]!, empty.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const [one, two] = await Promise.all([service.issueInvoice(contexts[0]!, created[0]!), service.issueInvoice(contexts[0]!, created[0]!)]);
    expect(one).toMatchObject({ status: "issued", total: "240.24", issuedAt: expect.any(Date) }); expect(two.issuedAt).toEqual(one.issuedAt);
    await expect(service.addInvoiceItem(contexts[0]!, one.id, { description: "Invalid edit", quantity: "1", unitPrice: "1", taxRate: "0" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.cancelInvoice(contexts[0]!, one.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await service.cancelInvoice(contexts[0]!, empty.id); await expect(service.issueInvoice(contexts[0]!, empty.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("enforces permissions independently of RLS and leaves source conversion explicit/deferred", async () => {
    for (const role of ["READ_ONLY", "TECHNICIAN"] as const) { await expect(service.createDraftInvoice({ ...contexts[0]!, role }, draft(customerIds[0]!))).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(service.issueInvoice({ ...contexts[0]!, role }, created[1]!)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    const accountant = { ...contexts[0]!, role: "ACCOUNTANT" as const };
    const linked = await service.createDraftInvoice(accountant, { ...draft(customerIds[0]!), quoteId: sourceQuotes[0], jobId: sourceJobs[0] });
    expect(linked).toMatchObject({ organizationId: orgs[0], customerId: customerIds[0], quoteId: sourceQuotes[0], jobId: sourceJobs[0] });
    expect((await service.getInvoice(accountant, linked.id)).items).toEqual([]);
    await expect(service.createDraftInvoice(contexts[0]!, { ...draft(customerIds[0]!), quoteId: sourceQuotes[1] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.update(quotes).set({ status: "draft" }).where(and(eq(quotes.id, sourceQuotes[0]!), eq(quotes.organizationId, orgs[0]!)));
    await service.addInvoiceItem(accountant, linked.id, { description: "Manual line", quantity: "1", unitPrice: "1", taxRate: "0" });
    await expect(service.issueInvoice(accountant, linked.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
