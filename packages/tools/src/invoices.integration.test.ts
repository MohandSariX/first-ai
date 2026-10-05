import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CurrentBusinessUser } from "@first-ai/auth";
import { and, eq } from "drizzle-orm";
import { createDatabaseClient, customers, customerSites, invoices, invoiceItems, InvoiceStore, jobs, organizations, quotes, services, users, payments, PaymentStore } from "@first-ai/database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { InvoiceService } from "./invoice-service.js";
import { createInvoiceToolRegistry } from "./invoice-tools.js";
import { PaymentService } from "./payment-service.js";

describe("local invoice foundation", () => {
  const orgs = [randomUUID(), randomUUID()], customerIds = [randomUUID(), randomUUID()], userIds = [randomUUID(), randomUUID()], authIds: string[] = [];
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  let db: ReturnType<typeof createDatabaseClient>, service: InvoiceService, store: InvoiceStore, admin: SupabaseClient, paymentService: PaymentService;
  const clients: SupabaseClient[] = [], contexts: CurrentBusinessUser[] = [], created: string[] = [], sourceQuotes: string[] = [], sourceJobs: string[] = [], sourceServices: string[] = [];
  const draft = (customerId: string) => ({ customerId, issueDate: "2026-10-05", dueDate: "2026-11-05" });
  beforeAll(async () => {
    for (const name of ["DATABASE_URL", "SUPABASE_URL"]) if (!["localhost", "127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname)) throw new Error("Invoice integration refuses non-local configuration.");
    admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, clientOptions);
    db = createDatabaseClient(); store = new InvoiceStore(db); service = new InvoiceService(store);
    paymentService = new PaymentService(new PaymentStore(db));
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
      for (const org of orgs) { for (const table of [payments, invoiceItems, invoices, jobs, quotes, customerSites, services, customers, users]) await clean(db.delete(table).where(eq(table.organizationId, org))); await clean(db.delete(organizations).where(eq(organizations.id, org))); }
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
  const receipt = (amount = "10") => ({ amount, method: "bank_transfer", paidAt: "2026-01-01T12:00:00Z", reference: "Fictional receipt", idempotencyKey: randomUUID() });
  async function issued(n = 0, amount = "100") {
    const invoice = await service.createDraftInvoice(contexts[n]!, draft(customerIds[n]!));
    await service.addInvoiceItem(contexts[n]!, invoice.id, { description: "Fictional payment line", quantity: "1", unitPrice: amount, taxRate: "0" });
    return service.issueInvoice(contexts[n]!, invoice.id);
  }
  it("records partial then full payment atomically and replays the same request exactly once", async () => {
    const invoice = await issued(), input = receipt("40"), c = contexts[0]!;
    const results = await Promise.all([paymentService.recordPayment(c, invoice.id, input), paymentService.recordPayment(c, invoice.id, input)]);
    expect(results[0]!.payment.id).toBe(results[1]!.payment.id);
    expect(results[0]!.invoice).toMatchObject({ status: "partially_paid", amountPaid: "40.00", amountDue: "60.00", paidAt: null });
    const last = receipt("60"), result = await paymentService.recordPayment(c, invoice.id, last);
    expect(result.invoice).toMatchObject({ status: "paid", amountPaid: "100.00", amountDue: "0.00", paidAt: new Date(last.paidAt) });
    expect((await paymentService.recordPayment(c, invoice.id, last)).payment.id).toBe(result.payment.id);
    expect(await paymentService.listPayments(c, invoice.id)).toHaveLength(2);
    await expect(paymentService.recordPayment(c, invoice.id, { ...last, amount: "1" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(paymentService.recordPayment(c, invoice.id, receipt("1"))).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("serializes concurrent receipts and rolls back overpayment without losing balance", async () => {
    const invoice = await issued(), c = contexts[0]!;
    const outcomes = await Promise.allSettled([paymentService.recordPayment(c, invoice.id, receipt("60")), paymentService.recordPayment(c, invoice.id, receipt("60"))]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await service.getInvoice(c, invoice.id)).toMatchObject({ amountPaid: "60.00", amountDue: "40.00", status: "partially_paid" });
    expect(await paymentService.listPayments(c, invoice.id)).toHaveLength(1);
  });
  it("rolls back the receipt if invoice balance persistence fails", async () => {
    const invoice = await issued(), paymentStore = new PaymentStore(db);
    const failing = new PaymentService({ invoices: paymentStore.invoices, payments: paymentStore.payments, transaction: fn => paymentStore.transaction(async s => {
      s.invoices.update = async () => { throw new Error("Fictional persistence failure"); };
      return fn(s);
    }) });
    await expect(failing.recordPayment(contexts[0]!, invoice.id, receipt())).rejects.toThrow("Fictional persistence failure");
    expect(await paymentService.listPayments(contexts[0]!, invoice.id)).toEqual([]);
    expect(await service.getInvoice(contexts[0]!, invoice.id)).toMatchObject({ status: "issued", amountPaid: "0.00", amountDue: "100.00" });
  });
  it("corrects a receipt without deleting history, is idempotent and clears paid_at", async () => {
    const invoice = await issued(), c = contexts[0]!, input = receipt("100");
    const recorded = await paymentService.recordPayment(c, invoice.id, input);
    const corrected = await paymentService.cancelPayment(c, invoice.id, recorded.payment.id, { reason: "Fictional entry mistake" });
    expect(corrected.payment).toMatchObject({ status: "cancelled", cancelledByUserId: c.userId, cancellationReason: "Fictional entry mistake" });
    expect(corrected.invoice).toMatchObject({ status: "issued", amountPaid: "0.00", amountDue: "100.00", paidAt: null });
    expect((await paymentService.cancelPayment(c, invoice.id, recorded.payment.id, { reason: "Retry" })).payment.cancelledAt).toEqual(corrected.payment.cancelledAt);
    expect((await paymentService.recordPayment(c, invoice.id, input)).payment.status).toBe("cancelled");
    expect(await paymentService.listPayments(c, invoice.id)).toHaveLength(1);
  });
  it("denies draft/cancelled/future receipts and duplicate keys on another invoice", async () => {
    const c = contexts[0]!, draftInvoice = await service.createDraftInvoice(c, draft(customerIds[0]!));
    await expect(paymentService.recordPayment(c, draftInvoice.id, receipt())).rejects.toMatchObject({ code: "CONFLICT" });
    await service.cancelInvoice(c, draftInvoice.id);
    await expect(paymentService.recordPayment(c, draftInvoice.id, receipt())).rejects.toMatchObject({ code: "CONFLICT" });
    const invoice = await issued(), input = receipt(); await paymentService.recordPayment(c, invoice.id, input);
    await expect(paymentService.recordPayment(c, (await issued()).id, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(paymentService.recordPayment(c, invoice.id, { ...receipt(), paidAt: "2099-01-01T00:00:00Z" })).rejects.toMatchObject({ code: "CONFLICT" });
    const pair = await Promise.all([issued(), issued()]), same = receipt();
    const outcomes = await Promise.allSettled(pair.map(i => paymentService.recordPayment(c, i.id, same)));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failure = outcomes.find(r => r.status === "rejected"); expect(failure?.status === "rejected" ? failure.reason : undefined).toMatchObject({ code: "CONFLICT" });
  });
  it("revalidates current membership and database role on financial writes", async () => {
    const invoice = await issued(), c = contexts[0]!;
    for (const role of ["READ_ONLY", "TECHNICIAN"] as const) await expect(paymentService.recordPayment({ ...c, role }, invoice.id, receipt())).rejects.toMatchObject({ code: "FORBIDDEN" });
    try {
      for (const patch of [{ role: "READ_ONLY" as const }, { role: "OWNER" as const, status: "inactive" }, { status: "active", deletedAt: new Date() }]) {
        await db.update(users).set(patch).where(eq(users.id, c.userId));
        await expect(paymentService.recordPayment(c, invoice.id, receipt())).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      await db.update(users).set({ role: "ACCOUNTANT", status: "active", deletedAt: null }).where(eq(users.id, c.userId));
      expect((await paymentService.recordPayment({ ...c, role: "ACCOUNTANT" }, invoice.id, receipt())).invoice.amountPaid).toBe("10.00");
      await db.update(organizations).set({ status: "inactive" }).where(eq(organizations.id, c.organizationId));
      await expect(paymentService.recordPayment(c, invoice.id, receipt())).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(users).set({ role: "OWNER", status: "active", deletedAt: null }).where(eq(users.id, c.userId)); await db.update(organizations).set({ status: "active" }).where(eq(organizations.id, c.organizationId)); }
  });
  it("protects payment lists/exact UUIDs with authenticated RLS and privileged scoping", async () => {
    const invoiceA = await issued(0), invoiceB = await issued(1);
    const a = await paymentService.recordPayment(contexts[0]!, invoiceA.id, receipt()), b = await paymentService.recordPayment(contexts[1]!, invoiceB.id, receipt());
    for (const [n, own, foreign] of [[0, a, b], [1, b, a]] as const) {
      const result = await clients[n]!.from("payments").select("id").eq("id", own.payment.id); expect(result.error).toBeNull(); expect(result.data).toHaveLength(1);
      const attack = await clients[n]!.from("payments").select("id").eq("id", foreign.payment.id); expect(attack.error).toBeNull(); expect(attack.data).toEqual([]);
      await expect(paymentService.listPayments(contexts[n]!, foreign.invoice.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(paymentService.cancelPayment(contexts[n]!, own.invoice.id, foreign.payment.id, { reason: "Attack" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(paymentService.recordPayment(contexts[n]!, foreign.invoice.id, receipt())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await admin.from("payments").select("id").in("id", [a.payment.id, b.payment.id])).data).toHaveLength(2);
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions); expect((await anon.from("payments").select("id")).data).toEqual([]);
    const write = await clients[0]!.from("payments").insert({ organization_id: orgs[0], invoice_id: invoiceA.id, customer_id: customerIds[0], amount: "1", method: "cash", paid_at: receipt().paidAt, created_by_user_id: userIds[0], idempotency_key: randomUUID() }); expect(write.error).not.toBeNull();
    try { for (const patch of [{ role: "TECHNICIAN" as const }, { role: "OWNER" as const, status: "inactive" }]) { await db.update(users).set(patch).where(eq(users.id, userIds[0]!)); expect((await clients[0]!.from("payments").select("id").eq("id", a.payment.id)).data).toEqual([]); } }
    finally { await db.update(users).set({ role: "OWNER", status: "active" }).where(eq(users.id, userIds[0]!)); }
  });
  it("enforces payment tenant/customer/creator integrity and positive amounts in PostgreSQL", async () => {
    const invoice = await issued(), input = { organizationId: orgs[0]!, invoiceId: invoice.id, customerId: customerIds[0]!, createdByUserId: userIds[0]!, amount: "1", method: "cash" as const, paidAt: new Date(receipt().paidAt) };
    for (const patch of [{ customerId: customerIds[1]! }, { invoiceId: (await issued(1)).id }, { createdByUserId: userIds[1]! }]) await expect(db.insert(payments).values({ ...input, ...patch, idempotencyKey: randomUUID() })).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(db.insert(payments).values({ ...input, amount: "0", idempotencyKey: randomUUID() })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.update(invoices).set({ amountDue: "-1" }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
