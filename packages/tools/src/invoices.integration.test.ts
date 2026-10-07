import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CurrentBusinessUser } from "@first-ai/auth";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseClient, customers, customerSites, invoices, invoiceItems, invoiceNumberCounters, InvoiceStore, jobs, organizations, quotes, services, users, payments, PaymentStore } from "@first-ai/database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { InvoiceService } from "./invoice-service.js";
import { createInvoiceToolRegistry } from "./invoice-tools.js";
import { PaymentService } from "./payment-service.js";
import { BillingIdentityService } from "./billing-service.js";
import { sellerBillingSchema, customerBillingSchema, invoiceIssueCalendar } from "@first-ai/schemas";
import { fictionalInvoiceTerms, fictionalBusinessDetails } from "./test-invoice-mentions.js";
import { CreditNoteStore, creditNotes, creditNoteItems, creditNoteNumberCounters, financialAuditEvents, InvoiceSession } from "@first-ai/database";
import { CreditNoteService } from "./credit-note-service.js";
import { FinancialAuditService } from "./financial-audit-service.js";

describe("local invoice foundation", () => {
  const orgs = [randomUUID(), randomUUID()], customerIds = [randomUUID(), randomUUID()], userIds = [randomUUID(), randomUUID()], authIds: string[] = [];
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  let db: ReturnType<typeof createDatabaseClient>, service: InvoiceService, store: InvoiceStore, admin: SupabaseClient, paymentService: PaymentService;
  const clients: SupabaseClient[] = [], contexts: CurrentBusinessUser[] = [], created: string[] = [], sourceQuotes: string[] = [], sourceJobs: string[] = [], sourceServices: string[] = [];
  const draft = (customerId: string) => ({ customerId, businessDetails: fictionalBusinessDetails, dueDate: "2026-11-05", transactionType: "B2B" as const, operationCategory: "services" as const, fiscalTerritory: "domestic" as const, vatTreatment: "normal" as const, vatReason: null });
  beforeAll(async () => {
    for (const name of ["DATABASE_URL", "SUPABASE_URL"]) if (!["localhost", "127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname)) throw new Error("Invoice integration refuses non-local configuration.");
    admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, clientOptions);
    db = createDatabaseClient(); store = new InvoiceStore(db); service = new InvoiceService(store);
    paymentService = new PaymentService(new PaymentStore(db));
    for (let n = 0; n < 2; n++) {
      const email = `invoice-${orgs[n]}@example.test`, password = `Fictional-${randomUUID()}`;
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error; authIds.push(result.data.user.id);
      await db.insert(organizations).values({ id: orgs[n]!, name: `Fictional invoice tenant ${n}`, legalName: `Fictional seller ${n}`, addressLine1: "1 Rue Fictive", postalCode: "75001", city: "Paris", legalEntityType: "company", legalForm: "SAS", registration: "RCS Paris (fictif)", shareCapital: "1000", siren: "123456789", vatNumber: "FR00123456789", vatRegime: "normal", vatOnDebits: false, invoiceTerms: fictionalInvoiceTerms });
      await db.insert(users).values({ id: userIds[n]!, organizationId: orgs[n]!, authUserId: authIds[n]!, firstName: "Fictional", lastName: "Invoice owner", email, role: "OWNER" });
      await db.insert(customers).values({ id: customerIds[n]!, organizationId: orgs[n]!, type: "company", name: `Fictional invoice customer ${n}`, billingName: `Fictional invoice customer ${n}`, billingLegalName: `Fictional legal customer ${n}`, billingClassification: "professional", billingAddressLine1: "2 Rue de Facturation Fictive", billingPostalCode: "75002", billingCity: "Paris", billingCountry: "FR", establishmentCountry: "FR", taxablePerson: true, siren: "987654321" });
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
      for (const org of orgs) {
        // Test-only owner cleanup, never a runtime bypass. Local URL + exact owned fictional tenant.
        await clean(db.transaction(async tx => {
          if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Refuse remote fixture cleanup");
          const [fixture] = await tx.select().from(organizations).where(eq(organizations.id, org));
          if (!fixture || !/^Fictional invoice tenant [01]$/.test(fixture.name)) throw new Error("Refuse non-fixture cleanup");
          await tx.execute(sql`set local session_replication_role = replica`);
          for (const table of [financialAuditEvents, creditNoteItems, creditNotes, creditNoteNumberCounters, payments, invoiceItems, invoices, invoiceNumberCounters]) await tx.delete(table).where(eq(table.organizationId, org));
        }));
        for (const table of [jobs, quotes, customerSites, services, customers, users]) await clean(db.delete(table).where(eq(table.organizationId, org)));
        await clean(db.delete(organizations).where(eq(organizations.id, org)));
      }
      await clean(db.$client.end());
    }
    if (admin) for (const id of authIds) { const result = await admin.auth.admin.deleteUser(id); if (result.error) errors.push(result.error); }
    if (errors.length) throw new AggregateError(errors, "Invoice fixture cleanup failed.");
  });
  it("M2 numbers only issuance, in reverse draft order, without gaps from cancelled/deleted drafts", async () => {
    const c = contexts[0]!, rows = [];
    for (let n = 0; n < 4; n++) rows.push(await service.createDraftInvoice(c, draft(customerIds[0]!)));
    for (const row of rows) expect(row).toMatchObject({ invoiceNumber: null, issueDate: null, issuedAt: null, draftReference: `BROUILLON-${row.id}` });
    expect(await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId))).toEqual([]);
    await service.cancelInvoice(c, rows[2]!.id);
    await db.update(invoices).set({ deletedAt: new Date() }).where(eq(invoices.id, rows[3]!.id));
    for (const row of rows.slice(0, 2)) await service.addInvoiceItem(c, row.id, { description: "Chronologie fictive", quantity: "1", unitPrice: "10", taxRate: "20" });
    const b = await service.issueInvoice(c, rows[1]!.id), a = await service.issueInvoice(c, rows[0]!.id);
    const year = invoiceIssueCalendar(b.issuedAt!, "Europe/Paris").fiscalYear;
    expect(b.invoiceNumber).toBe(`FAC-${year}-000001`); expect(a.invoiceNumber).toBe(`FAC-${year}-000002`);
    expect(a.issuedAt!.getTime()).toBeGreaterThanOrEqual(b.issuedAt!.getTime());
    expect(a.issueDate).toBe(invoiceIssueCalendar(a.issuedAt!, "Europe/Paris").issueDate);
    expect(a.documentSnapshot).toMatchObject({ version: 4, invoice: { number: a.invoiceNumber, issueDate: a.issueDate }, issuance: { issuedAt: a.issuedAt!.toISOString(), timeZone: "Europe/Paris", fiscalYear: year } });
    const retry = await service.issueInvoice(c, a.id);
    expect(retry.invoiceNumber).toBe(a.invoiceNumber); expect(retry.issueDate).toBe(a.issueDate); expect(retry.issuedAt).toEqual(a.issuedAt); expect(retry.documentSnapshot).toEqual(a.documentSnapshot);
    expect((await service.getInvoice(contexts[1]!, created[1]!)).invoiceNumber).toBeNull();
    for (const query of [a.invoiceNumber!, a.draftReference]) expect(await service.searchInvoices(c, { query })).toEqual(expect.arrayContaining([expect.objectContaining({ invoice: expect.objectContaining({ id: a.id }) })]));
  });
  it("M2 serializes concurrent issues into unique consecutive committed numbers", async () => {
    const c = contexts[0]!, drafts = await Promise.all([service.createDraftInvoice(c, draft(customerIds[0]!)), service.createDraftInvoice(c, draft(customerIds[0]!))]);
    for (const row of drafts) await service.addInvoiceItem(c, row.id, { description: "Concurrence fictive", quantity: "1", unitPrice: "10", taxRate: "20" });
    const results = await Promise.all(drafts.map(row => service.issueInvoice(c, row.id)));
    const year = invoiceIssueCalendar(results[0]!.issuedAt!, "Europe/Paris").fiscalYear;
    expect(results.map(i => i.invoiceNumber).sort()).toEqual([`FAC-${year}-000003`, `FAC-${year}-000004`]);
    const sorted = results.sort((a,b) => a.invoiceNumber!.localeCompare(b.invoiceNumber!));
    expect(sorted[1]!.issuedAt!.getTime()).toBeGreaterThanOrEqual(sorted[0]!.issuedAt!.getTime());
    // M5A now blocks deletion as well as retaining the allocation high-water mark.
    await expect(db.delete(invoices).where(eq(invoices.id, sorted[1]!.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    const next = await service.createDraftInvoice(c, draft(customerIds[0]!));
    await service.addInvoiceItem(c, next.id, { description: "Réservation durable fictive", quantity: "1", unitPrice: "10", taxRate: "20" });
    expect((await service.issueInvoice(c, next.id)).invoiceNumber).toBe(`FAC-${year}-000005`);
  });
  it("M2 starts a separate annual series and resumes legacy high-water marks without renumbering", async () => {
    const c = contexts[1]!, calendar = invoiceIssueCalendar(new Date(), "Europe/Paris"), year = calendar.fiscalYear;
    await db.insert(invoiceNumberCounters).values({ organizationId: c.organizationId, fiscalYear: year - 1, lastNumber: 42, lastIssuedAt: new Date(`${year - 1}-12-30T12:00:00Z`), lastIssueDate: `${year - 1}-12-30`, lastInvoiceId: randomUUID() });
    const first = await service.issueInvoice(c, created[1]!);
    expect(first.invoiceNumber).toBe(`FAC-${year}-000001`);
    const historical = await db.select().from(invoiceNumberCounters).where(and(eq(invoiceNumberCounters.organizationId, c.organizationId), eq(invoiceNumberCounters.fiscalYear, year - 1)));
    expect(historical[0]!.lastNumber).toBe(42);
    await expect(db.update(invoiceNumberCounters).set({ lastNumber: 1 }).where(eq(invoiceNumberCounters.organizationId, c.organizationId))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId))).rejects.toMatchObject({ cause: { code: "23514" } });
    // Preserve the issued document even when the counter's next allocation belongs to another invoice.
    const saved = structuredClone(first.documentSnapshot);
    expect((await service.issueInvoice(c, first.id)).documentSnapshot).toEqual(saved);
  });
  it("M2 forbids changing/reusing issued numbers and denies public counter/RPC access", async () => {
    const issued = await service.issueInvoice(contexts[1]!, created[1]!);
    for (const patch of [{ invoiceNumber: "FAC-2026-999999" }, { issueDate: "2099-01-01" }, { issuedAt: new Date("2099-01-01T00:00:00Z") }, { draftReference: "BROUILLON-edited" }]) await expect(db.update(invoices).set(patch).where(eq(invoices.id, issued.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(invoices).values({ ...draft(customerIds[1]!), organizationId: orgs[1]!, createdByUserId: userIds[1]!, invoiceNumber: issued.invoiceNumber })).rejects.toMatchObject({ cause: { code: "23514" } });
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
    for (const client of [anon, clients[0]!, clients[1]!]) {
      expect((await client.from("invoice_number_counters").select("*")).error).not.toBeNull();
      expect((await client.rpc("allocate_invoice_number", { p_org: orgs[1], p_invoice: created[1] })).error).not.toBeNull();
    }
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
    for (const extra of [{ customerId: customerIds[1]! }, { quoteId: sourceQuotes[1]! }, { jobId: sourceJobs[1]! }]) await expect(db.insert(invoices).values({ organizationId: orgs[0]!, createdByUserId: userIds[0]!, ...draft(customerIds[0]!), ...extra })).rejects.toMatchObject({ cause: { code: "23503" } });
    const editable = await service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!));
    await expect(db.insert(invoiceItems).values({ organizationId: orgs[0]!, invoiceId: editable.id, serviceId: sourceServices[1]!, description: "Invalid", quantity: "1", unitPrice: "1", taxRate: "20" })).rejects.toMatchObject({ cause: { code: "23503" } });
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
  const credits = () => new CreditNoteService(new CreditNoteStore(db));
  const creditInput = (id: string, correctionType: "partial" | "full" = "partial") => ({ originalInvoiceId: id, correctionType, reason: "Correction tarifaire fictive M4", idempotencyKey: randomUUID() });
  async function partial(id: string, amount: string, n = 0) {
    const c = contexts[n]!, note = await credits().createDraft(c, creditInput(id));
    await credits().setItem(c, note.id, { originalLineIndex: 0, subtotal: amount }); return note;
  }
  it("M4 drafts do not allocate AV numbers; issue/retry freezes a partial correction without changing the original", async () => {
    const c = contexts[0]!, invoice = await issued(), original = structuredClone(invoice), input = creditInput(invoice.id);
    const originalItems = structuredClone((await service.getInvoice(c, invoice.id)).items);
    const note = await credits().createDraft(c, input);
    expect(note).toMatchObject({ status: "draft", number: null, issuedAt: null, snapshot: null });
    expect((await credits().createDraft(c, input)).id).toBe(note.id);
    await credits().setItem(c, note.id, { originalLineIndex: 0, subtotal: "20" });
    const result = await credits().issue(c, note.id), year = invoiceIssueCalendar(result.issuedAt!, "Europe/Paris").fiscalYear;
    expect(result.number).toBe(`AV-${year}-000001`);
    expect(result.snapshot).toMatchObject({ originalInvoice: original.documentSnapshot, totals: { subtotal: "20.00", taxAmount: "0.00", total: "20.00" } });
    expect(await credits().issue(c, note.id)).toEqual(result);
    const after = await service.getInvoice(c, invoice.id);
    for (const key of ["invoiceNumber", "issueDate", "issuedAt", "subtotal", "taxAmount", "total", "documentSnapshot"] as const) expect(after[key]).toEqual(original[key]);
    expect(after).toMatchObject({ amountCredited: "20.00", amountDue: "80.00", customerCredit: "0.00", amountPaid: "0.00", status: "issued" });
    await expect(credits().setItem(c, note.id, { originalLineIndex: 0, subtotal: "1" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(credits().cancel(c, note.id)).rejects.toMatchObject({ code: "CONFLICT" });
    for (const patch of [{ number: `AV-${year}-999999` }, { reason: "Edited" }, { snapshot: null }, { originalInvoiceId: created[0]! }]) await expect(db.update(creditNotes).set(patch).where(eq(creditNotes.id, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.update(creditNoteItems).set({ subtotal: "1", total: "1" }).where(eq(creditNoteItems.creditNoteId, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(creditNoteItems).where(eq(creditNoteItems.creditNoteId, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    expect((await service.getInvoice(c, invoice.id)).items).toEqual(originalItems);
  });
  it("M4 serializes AV numbering, skips abandoned drafts and rolls back failed issuance after allocation", async () => {
    const c = contexts[0]!, invoice = await issued(), cancelled = await partial(invoice.id, "1");
    await credits().cancel(c, cancelled.id); await expect(credits().issue(c, cancelled.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const first = await partial(invoice.id, "10"), second = await partial(invoice.id, "10"), counter = await db.select().from(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, c.organizationId));
    const real = new CreditNoteStore(db);
    const failing = new CreditNoteService({ creditNotes: real.creditNotes, transaction: work => real.transaction(async s => { s.invoices.update = async () => { throw new Error("Fictional M4 balance persistence failure"); }; return work(s); }) });
    await expect(failing.issue(c, first.id)).rejects.toThrow("Fictional M4 balance persistence failure");
    expect(await db.select().from(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, c.organizationId))).toEqual(counter);
    expect(await credits().getCreditNote(c, first.id)).toMatchObject({ status: "draft", number: null, snapshot: null });
    const b = await credits().issue(c, second.id), a = await credits().issue(c, first.id);
    expect(Number(a.number!.split("-").at(-1))).toBe(Number(b.number!.split("-").at(-1)) + 1);
    expect(a.issuedAt!.getTime()).toBeGreaterThanOrEqual(b.issuedAt!.getTime());
    const pair = await Promise.all([issued(), issued()]), notes = await Promise.all(pair.map(i => partial(i.id, "10")));
    const result = await Promise.all(notes.map(n => credits().issue(c, n.id))), numbers = result.map(n => Number(n.number!.split("-").at(-1))).sort((a,b) => a-b);
    expect(numbers[1]).toBe(numbers[0]! + 1);
    await expect(db.update(creditNoteNumberCounters).set({ lastNumber: 1 }).where(eq(creditNoteNumberCounters.organizationId, c.organizationId))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, c.organizationId))).rejects.toMatchObject({ cause: { code: "23514" } });
    const empty = await credits().createDraft(c, creditInput(invoice.id));
    await expect(credits().issue(c, empty.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("M4 prevents concurrent over-correction and stale full drafts; corrects the remaining base only", async () => {
    const c = contexts[0]!, invoice = await issued(), full = await credits().createDraft(c, creditInput(invoice.id, "full"));
    const notes = await Promise.all([partial(invoice.id, "70"), partial(invoice.id, "70")]);
    const before = await db.select().from(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, c.organizationId));
    const results = await Promise.allSettled(notes.map(n => credits().issue(c, n.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await db.select().from(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, c.organizationId)))[0]!.lastNumber).toBe(before[0]!.lastNumber + 1);
    const loserId = (await credits().getCreditNote(c, notes[0]!.id)).status === "draft" ? notes[0]!.id : notes[1]!.id;
    const loser = await credits().getCreditNote(c, loserId);
    const originalLine = loser.original.lines[0]!;
    // Bypass the service's prior-correction calculation deliberately: PostgreSQL must reject too.
    await expect(new CreditNoteStore(db).transaction(async s => {
      const sc = { organizationId: c.organizationId, creditNoteId: loserId };
      await s.invoices.get({ organizationId: c.organizationId, invoiceId: invoice.id }, true);
      const allocation = await s.creditNotes.allocate(sc);
      const snapshot = { version: 1 as const, organizationId: c.organizationId, creditNoteId: loserId, ...allocation, issuedAt: allocation.issuedAt.toISOString(), originalInvoice: loser.original, reason: loser.reason, correctionType: "partial" as const, lines: [{ originalLineIndex: 0, description: originalLine.description, originalQuantity: originalLine.quantity, unit: "unit" in originalLine ? originalLine.unit : null, taxRate: "0.000", subtotal: "70.00", taxAmount: "0.00", total: "70.00" }], totals: { subtotal: "70.00", taxAmount: "0.00", total: "70.00" }, taxes: [{ rate: "0.000", base: "70.00", amount: "0.00" }] };
      await s.creditNotes.update(sc, { status: "issued", number: allocation.number, issueDate: allocation.issueDate, issuedAt: allocation.issuedAt, snapshot });
    })).rejects.toMatchObject({ cause: { code: "23514", message: "Cumulative overcorrection" } });
    await expect(credits().issue(c, full.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const remaining = await credits().createDraft(c, creditInput(invoice.id, "full"));
    expect(remaining.total).toBe("30.00"); await credits().issue(c, remaining.id);
    expect(await service.getInvoice(c, invoice.id)).toMatchObject({ total: "100.00", amountCredited: "100.00", amountDue: "0.00", amountPaid: "0.00", customerCredit: "0.00" });
    await expect(db.update(invoices).set({ amountPaid: "101.00", amountCredited: "0.00", amountDue: "0.00", customerCredit: "1.00" }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(credits().createDraft(c, creditInput(invoice.id))).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("M4 preserves manual payment history and distinguishes debt/credit, including payment after correction", async () => {
    const c = contexts[0]!;
    for (const [received, due, customerCredit] of [["0", "80.00", "0.00"], ["50", "30.00", "0.00"], ["100", "0.00", "20.00"]]) {
      const invoice = await issued(); if (received !== "0") await paymentService.recordPayment(c, invoice.id, receipt(received));
      const paymentsBefore = await paymentService.listPayments(c, invoice.id), note = await partial(invoice.id, "20"); await credits().issue(c, note.id);
      expect(await service.getInvoice(c, invoice.id)).toMatchObject({ amountDue: due, customerCredit, amountCredited: "20.00" });
      expect(await paymentService.listPayments(c, invoice.id)).toEqual(paymentsBefore);
      if (received === "0") { await expect(paymentService.recordPayment(c, invoice.id, receipt("81"))).rejects.toMatchObject({ code: "CONFLICT" }); await paymentService.recordPayment(c, invoice.id, receipt("80")); expect(await service.getInvoice(c, invoice.id)).toMatchObject({ status: "paid", amountPaid: "80.00", amountDue: "0.00", amountCredited: "20.00" }); }
      if (received === "100") { await paymentService.cancelPayment(c, invoice.id, paymentsBefore[0]!.id, { reason: "Erreur de saisie fictive, aucun remboursement" }); expect(await service.getInvoice(c, invoice.id)).toMatchObject({ amountPaid: "0.00", amountDue: "80.00", customerCredit: "0.00", amountCredited: "20.00" }); }
    }
  });
  it("M4 mirrors multiple original VAT rates and consumes their exact remaining rounded tax", async () => {
    const c = contexts[0]!, draftInvoice = await service.createDraftInvoice(c, draft(customerIds[0]!));
    for (const rate of ["20", "5.5"]) await service.addInvoiceItem(c, draftInvoice.id, { description: `TVA fictive ${rate}`, quantity: "1", unitPrice: "100", taxRate: rate });
    const invoice = await service.issueInvoice(c, draftInvoice.id), note = await credits().createDraft(c, creditInput(invoice.id));
    for (const originalLineIndex of [0,1]) await credits().setItem(c, note.id, { originalLineIndex, subtotal: "20" });
    expect((await credits().issue(c, note.id)).snapshot).toMatchObject({ totals: { subtotal: "40.00", taxAmount: "5.10", total: "45.10" }, taxes: expect.arrayContaining([{ rate: "20.000", base: "20.00", amount: "4.00" }, { rate: "5.500", base: "20.00", amount: "1.10" }]) });
    const remaining = await credits().createDraft(c, creditInput(invoice.id, "full")); await credits().issue(c, remaining.id);
    expect(await service.getInvoice(c, invoice.id)).toMatchObject({ total: "225.50", amountCredited: "225.50", amountDue: "0.00" });
  });
  it("M4 protects authenticated exact UUID access, anonymous/technician/inactive reads, and cross-tenant relations", async () => {
    const pair = await Promise.all([issued(0), issued(1)]), notes = await Promise.all(pair.map((i,n) => partial(i.id, "10", n)));
    const year = invoiceIssueCalendar(new Date(), "Europe/Paris").fiscalYear;
    await db.insert(creditNoteNumberCounters).values({ organizationId: orgs[1]!, fiscalYear: year - 1, lastNumber: 42, lastIssuedAt: new Date(`${year-1}-12-30T12:00:00Z`), lastIssueDate: `${year-1}-12-30`, lastCreditNoteId: randomUUID() });
    for (const n of [0,1]) await credits().issue(contexts[n]!, notes[n]!.id);
    expect((await credits().getCreditNote(contexts[1]!, notes[1]!.id)).number).toBe(`AV-${year}-000001`);
    for (const n of [0,1]) {
      for (const table of ["credit_notes", "credit_note_items"]) {
        const column = table === "credit_notes" ? "id" : "credit_note_id";
        const own = await clients[n]!.from(table).select("id").eq(column, notes[n]!.id); expect(own.error).toBeNull(); expect(own.data).toHaveLength(1);
        const attack = await clients[n]!.from(table).select("id").eq(column, notes[1-n]!.id); expect(attack.error).toBeNull(); expect(attack.data).toEqual([]);
      }
      await expect(credits().getDocument(contexts[n]!, notes[1-n]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(credits().createDraft(contexts[n]!, creditInput(pair[1-n]!.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await clients[n]!.rpc("allocate_credit_note_number", { p_org: orgs[n], p_note: notes[n]!.id })).error).not.toBeNull();
      // RLS has no counter policy: a SELECT is permitted but reveals zero rows.
      expect((await clients[n]!.from("credit_note_number_counters").select("*")).data).toEqual([]);
    }
    expect((await admin.from("credit_notes").select("id").in("id", notes.map(n => n.id))).data).toHaveLength(2);
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
    for (const table of ["credit_notes", "credit_note_items"]) expect((await anon.from(table).select("id")).data).toEqual([]);
    expect((await clients[0]!.from("credit_notes").update({ reason: "Attack" }).eq("id", notes[0]!.id).select("id")).data).toEqual([]);
    try {
      for (const patch of [{ role: "TECHNICIAN" as const }, { role: "OWNER" as const, status: "inactive" }, { status: "active", deletedAt: new Date() }]) {
        await db.update(users).set(patch).where(eq(users.id, userIds[0]!));
        for (const table of ["credit_notes", "credit_note_items"]) expect((await clients[0]!.from(table).select("id").eq("organization_id", orgs[0]!)).data).toEqual([]);
        await expect(credits().getDocument(contexts[0]!, notes[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(credits().issue(contexts[0]!, notes[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      await db.update(users).set({ role: "READ_ONLY", status: "active", deletedAt: null }).where(eq(users.id, userIds[0]!));
      expect((await clients[0]!.from("credit_notes").select("id").eq("id", notes[0]!.id)).data).toHaveLength(1);
      await expect(credits().issue(contexts[0]!, notes[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(users).set({ role: "OWNER", status: "active", deletedAt: null }).where(eq(users.id, userIds[0]!)); }
    const input = { organizationId: orgs[0]!, originalInvoiceId: pair[0]!.id, createdByUserId: userIds[0]!, reason: "Fictif", correctionType: "partial" };
    for (const patch of [{ originalInvoiceId: pair[1]!.id }, { createdByUserId: userIds[1]! }]) await expect(db.insert(creditNotes).values({ ...input, ...patch, idempotencyKey: randomUUID() })).rejects.toMatchObject({ cause: { code: "23503" } });
    const foreignDraft = await credits().createDraft(contexts[1]!, creditInput(pair[1]!.id));
    await expect(db.insert(creditNoteItems).values({ organizationId: orgs[0]!, originalInvoiceId: pair[1]!.id, creditNoteId: foreignDraft.id, originalLineIndex: 0, subtotal: "1", taxAmount: "0", total: "1" })).rejects.toMatchObject({ cause: { code: "23503" } });
  });
  async function issued(n = 0, amount = "100") {
    const invoice = await service.createDraftInvoice(contexts[n]!, { ...draft(customerIds[n]!), vatTreatment: "exemption", vatReason: "Motif fictif validé pour ce scénario de test, sans usage fiscal réel" });
    await service.addInvoiceItem(contexts[n]!, invoice.id, { description: "Fictional payment line", quantity: "1", unitPrice: amount, taxRate: "0" });
    return service.issueInvoice(contexts[n]!, invoice.id);
  }
  it("atomically captures available billing identities and freezes issued document data", async () => {
    const invoice = await issued(), c = contexts[0]!, before = await service.getInvoiceDocument(c, invoice.id);
    expect(before.snapshot).toMatchObject({ version: 4, organizationId: c.organizationId, invoiceId: invoice.id, seller: { name: "Fictional invoice tenant 0", legalName: "Fictional seller 0", addressLine1: "1 Rue Fictive" }, customer: { name: "Fictional invoice customer 0", addressLine1: "2 Rue de Facturation Fictive" }, invoice: { number: invoice.invoiceNumber, status: "issued" }, totals: { total: "100.00" }, lines: [expect.objectContaining({ description: "Fictional payment line" })] });
    if (before.snapshot.version !== 4) throw new Error("Expected new document v4");
    try {
      await db.update(customers).set({ name: "Changed customer", legalName: "Changed legal identity" }).where(eq(customers.id, customerIds[0]!));
      await db.update(organizations).set({ legalName: "Changed seller", addressLine1: "Changed address" }).where(eq(organizations.id, orgs[0]!));
      expect((await service.getInvoiceDocument(c, invoice.id)).snapshot).toEqual(before.snapshot);
      expect((await service.issueInvoice(c, invoice.id)).documentSnapshot).toEqual(before.snapshot);
      await expect(db.update(invoices).set({ documentSnapshot: { ...before.snapshot, seller: { ...before.snapshot.seller, name: "Changed" } } }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(db.update(invoices).set({ notes: "Changed issued note" }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
      const item = (await service.getInvoice(c, invoice.id)).items[0]!;
      await expect(service.updateInvoiceItem(c, invoice.id, item.id, { unitPrice: "1" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(service.removeInvoiceItem(c, invoice.id, item.id)).rejects.toMatchObject({ code: "CONFLICT" });
      await paymentService.recordPayment(c, invoice.id, receipt("40"));
      const updated = await service.getInvoiceDocument(c, invoice.id);
      expect(updated.snapshot).toEqual(before.snapshot); expect(updated.payment).toMatchObject({ amountPaid: "40.00", amountDue: "60.00", status: "partially_paid" });
    } finally {
      await db.update(customers).set({ name: "Fictional invoice customer 0", legalName: null }).where(eq(customers.id, customerIds[0]!));
      await db.update(organizations).set({ legalName: "Fictional seller 0", addressLine1: "1 Rue Fictive" }).where(eq(organizations.id, orgs[0]!));
    }
  });
  it("rolls back issue if snapshot validation or persistence fails", async () => {
    const invoice = await service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!));
    const counterBefore = await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, orgs[0]!));
    await service.addInvoiceItem(contexts[0]!, invoice.id, { description: "Rollback", quantity: "1", unitPrice: "10", taxRate: "20" });
    try {
      await db.update(organizations).set({ currency: "USD" }).where(eq(organizations.id, orgs[0]!));
      await expect(service.issueInvoice(contexts[0]!, invoice.id)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await service.getInvoice(contexts[0]!, invoice.id)).toMatchObject({ status: "draft", issuedAt: null, documentSnapshot: null });
    } finally { await db.update(organizations).set({ currency: "EUR" }).where(eq(organizations.id, orgs[0]!)); }
    try {
      await db.update(organizations).set({ addressLine1: null }).where(eq(organizations.id, orgs[0]!));
      await expect(service.issueInvoice(contexts[0]!, invoice.id)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await service.getInvoice(contexts[0]!, invoice.id)).toMatchObject({ status: "draft", documentSnapshot: null, issuedAt: null });
    } finally { await db.update(organizations).set({ addressLine1: "1 Rue Fictive" }).where(eq(organizations.id, orgs[0]!)); }
    const failing = new InvoiceService({ ...store, invoices: store.invoices, customer: store.customer.bind(store), service: store.service.bind(store), quotes: store.quotes, jobs: store.jobs, timezone: store.timezone.bind(store), transaction: fn => store.transaction(async s => { s.invoices.update = async () => { throw new Error("Snapshot persistence failure"); }; return fn(s); }) });
    await expect(failing.issueInvoice(contexts[0]!, invoice.id)).rejects.toThrow("Snapshot persistence failure");
    expect(await service.getInvoice(contexts[0]!, invoice.id)).toMatchObject({ status: "draft", invoiceNumber: null, issueDate: null, issuedAt: null, documentSnapshot: null });
    expect(await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, orgs[0]!))).toEqual(counterBefore);
    const successful = await service.issueInvoice(contexts[0]!, invoice.id);
    expect(Number(successful.invoiceNumber!.slice(-6))).toBe(counterBefore[0]!.lastNumber + 1);
  });
  it("M2 rejects client-controlled dates and expired due dates without consuming a number", async () => {
    const c = contexts[0]!;
    for (const date of ["2099-01-01", "2000-01-01"]) await expect(service.createDraftInvoice(c, { ...draft(customerIds[0]!), issueDate: date })).rejects.toThrow();
    const row = await service.createDraftInvoice(c, { ...draft(customerIds[0]!), dueDate: "2000-01-01" });
    await service.addInvoiceItem(c, row.id, { description: "Échéance fictive passée", quantity: "1", unitPrice: "10", taxRate: "20" });
    const before = await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId));
    await expect(service.issueInvoice(c, row.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.getInvoice(c, row.id)).toMatchObject({ status: "draft", issueDate: null, invoiceNumber: null });
    expect(await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId))).toEqual(before);
    await expect(db.update(invoices).set({ issueDate: "2099-01-01" }).where(eq(invoices.id, row.id))).rejects.toMatchObject({ cause: { code: "23514" } });
  });
  it("denies known foreign document UUIDs and revalidates membership/role before download", async () => {
    const a = await issued(), b = await issued(1), c = contexts[0]!;
    await expect(service.getInvoiceDocument(c, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getInvoiceDocument(contexts[1]!, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    try {
      for (const patch of [{ role: "TECHNICIAN" as const }, { role: "OWNER" as const, status: "inactive" }, { status: "active", deletedAt: new Date() }]) {
        await db.update(users).set(patch).where(eq(users.id, c.userId));
        await expect(service.getInvoiceDocument(c, a.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      await db.update(users).set({ role: "READ_ONLY", status: "active", deletedAt: null }).where(eq(users.id, c.userId));
      expect((await service.getInvoiceDocument({ ...c, role: "READ_ONLY" }, a.id)).snapshot.invoiceId).toBe(a.id);
    } finally { await db.update(users).set({ role: "OWNER", status: "active", deletedAt: null }).where(eq(users.id, c.userId)); }
  });
  it("preserves legacy retry behavior and disallows new privileged issued inserts/imports", async () => {
    const next = await service.createDraftInvoice(contexts[0]!, draft(customerIds[0]!));
    const legacy = { ...next, invoiceNumber: "LEGACY-FICTIONAL", issueDate: "2026-01-01", status: "issued" as const, issuedAt: new Date("2026-01-01T00:00:00Z") };
    // Simulate a pre-existing historical row without disabling any DB guard to manufacture it.
    const legacyService = new InvoiceService({ ...store, invoices: store.invoices, customer: store.customer.bind(store), service: store.service.bind(store), quotes: store.quotes, jobs: store.jobs, timezone: store.timezone.bind(store), transaction: fn => store.transaction(async s => { s.invoices.get = async () => legacy; return fn(s); }) });
    await expect(legacyService.getInvoiceDocument(contexts[0]!, legacy.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await legacyService.issueInvoice(contexts[0]!, legacy.id)).toEqual(legacy);
    await expect(db.insert(invoices).values({ organizationId: orgs[0]!, createdByUserId: userIds[0]!, ...draft(customerIds[0]!), invoiceNumber: "LEGACY-FICTIONAL", status: "issued", issuedAt: new Date(), issueDate: "2026-01-01" })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.update(invoices).set({ status: "issued", issuedAt: new Date() }).where(eq(invoices.id, next.id))).rejects.toMatchObject({ cause: { code: "23514" } });
  });
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
  it("M1 scopes billing identity reads/writes, rejects anonymous and stale membership/roles", async () => {
    const billing = new BillingIdentityService(store), c = contexts[0]!;
    const current = await billing.getCustomer(c, customerIds[0]!);
    const input = customerBillingSchema.parse(Object.fromEntries(Object.keys(customerBillingSchema.shape).map(k => [k, current[k as keyof typeof current]])));
    await expect(billing.getCustomer(c, customerIds[1]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(billing.updateCustomer(c, customerIds[1]!, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const n of [0, 1]) {
      expect((await clients[n]!.from("customers").select("billing_address_line1").eq("id", customerIds[1 - n]!)).data).toEqual([]);
      expect((await clients[n]!.from("organizations").select("legal_form").eq("id", orgs[1 - n]!)).data).toEqual([]);
      expect((await clients[n]!.from("customers").update({ billing_city: "Attack" }).eq("id", customerIds[1 - n]!).select("id")).data).toEqual([]);
    }
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
    for (const table of ["organizations", "customers"]) expect((await anon.from(table).select("id")).data).toEqual([]);
    try {
      await db.update(users).set({ status: "inactive" }).where(eq(users.id, c.userId));
      await expect(billing.updateCustomer(c, customerIds[0]!, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await clients[0]!.from("customers").select("billing_city").eq("id", customerIds[0]!)).data).toEqual([]);
      await db.update(users).set({ status: "active", role: "READ_ONLY" }).where(eq(users.id, c.userId));
      await expect(billing.updateCustomer(c, customerIds[0]!, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(users).set({ status: "active", role: "OWNER" }).where(eq(users.id, c.userId)); }
    const seller = (await billing.getSeller(c))!;
    const sellerInput = sellerBillingSchema.parse(Object.fromEntries(Object.keys(sellerBillingSchema.shape).map(k => [k, seller[k as keyof typeof seller]])));
    for (const role of ["MANAGER", "ACCOUNTANT", "READ_ONLY", "TECHNICIAN"] as const) await expect(billing.updateSeller({ ...c, role }, sellerInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("M1 blocks missing explicit qualifications and captures complete B2B/B2C/B2G scenarios", async () => {
    const c = contexts[0]!, billing = new BillingIdentityService(store), customer = await billing.getCustomer(c, customerIds[0]!);
    const original = customerBillingSchema.parse(Object.fromEntries(Object.keys(customerBillingSchema.shape).map(k => [k, customer[k as keyof typeof customer]])));
    const next = await service.createDraftInvoice(c, { customerId: customerIds[0], dueDate: "2026-11-05" });
    await service.addInvoiceItem(c, next.id, { description: "M1 test", quantity: "1", unitPrice: "10", taxRate: "20" });
    await expect(service.issueInvoice(c, next.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await service.getInvoice(c, next.id)).toMatchObject({ status: "draft", documentSnapshot: null, issuedAt: null });
    const classification = { transactionType: "B2B", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal", vatReason: null };
    await service.updateClassification(c, next.id, classification);
    try {
      await billing.updateCustomer(c, customer.id, { ...original, billingAddressLine1: null });
      await expect(service.issueInvoice(c, next.id)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await service.getInvoice(c, next.id)).toMatchObject({ status: "draft", documentSnapshot: null });
      for (const [kind, transaction, category] of [["professional", "B2B", "services"], ["individual", "B2C", "goods"], ["public", "B2G", "mixed"]] as const) {
        await billing.updateCustomer(c, customer.id, { ...original, billingClassification: kind, taxablePerson: kind !== "individual", billingLegalName: kind === "individual" ? null : original.billingLegalName });
        const invoice = await service.createDraftInvoice(c, { ...draft(customer.id), transactionType: transaction, operationCategory: category });
        await service.addInvoiceItem(c, invoice.id, { description: "Scenario fictif", quantity: "1", unitPrice: "10", taxRate: "20" });
        const issued = await service.issueInvoice(c, invoice.id);
        expect(issued.documentSnapshot).toMatchObject({ version: 4, classification: { transactionType: transaction, operationCategory: category }, customer: { addressLine1: original.billingAddressLine1 } });
        await expect(service.updateClassification(c, issued.id, classification)).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(db.update(invoices).set({ operationCategory: "services" === category ? "goods" : "services" }).where(eq(invoices.id, issued.id))).rejects.toMatchObject({ cause: { code: "23514" } });
        const before = structuredClone(issued.documentSnapshot);
        await billing.updateCustomer(c, customer.id, { ...original, billingCity: "Ville modifiée" });
        expect((await service.getInvoiceDocument(c, issued.id)).snapshot).toEqual(before);
      }
    } finally { await billing.updateCustomer(c, customer.id, original); }
  });
  it("M1 issues a franchise invoice without inventing VAT identity or seller capital for EI", async () => {
    const c = contexts[0]!, billing = new BillingIdentityService(store), seller = (await billing.getSeller(c))!;
    const original = sellerBillingSchema.parse(Object.fromEntries(Object.keys(sellerBillingSchema.shape).map(k => [k, seller[k as keyof typeof seller]])));
    try {
      await billing.updateSeller(c, { ...original, legalEntityType: "individual_entrepreneur", legalForm: null, shareCapital: null, vatRegime: "franchise", vatNumber: null });
      const invoice = await service.createDraftInvoice(c, { ...draft(customerIds[0]!), vatTreatment: "franchise" });
      await service.addInvoiceItem(c, invoice.id, { description: "Franchise fictive", quantity: "1", unitPrice: "10", taxRate: "0" });
      expect((await service.issueInvoice(c, invoice.id)).documentSnapshot).toMatchObject({ version: 4, seller: { fiscalIdentity: { vatRegime: "franchise", shareCapital: null } }, classification: { vatTreatment: "franchise" }, totals: { total: "10.00" } });
      await billing.updateSeller(c, original);
      expect((await service.getInvoiceDocument(c, invoice.id)).snapshot.seller.vatNumber).toBeNull();
    } finally { await billing.updateSeller(c, original); }
  });
  it("M3 rolls back missing mentions, captures discounts/charges and freezes business data and terms", async () => {
    const c = contexts[0]!, billing = new BillingIdentityService(store);
    const invoice = await service.createDraftInvoice(c, { ...draft(customerIds[0]!), businessDetails: undefined });
    await service.addInvoiceItem(c, invoice.id, { description: "Prestation M3 fictive", unit: "heure", quantity: "2", unitPrice: "100", taxRate: "20", discountAmount: "10" });
    await service.addInvoiceItem(c, invoice.id, { description: "Frais explicites fictifs", kind: "charge", unit: "forfait", quantity: "1", unitPrice: "10", taxRate: "5.5" });
    await expect(service.addInvoiceItem(c, invoice.id, { description: "Remise excessive fictive", quantity: "1", unitPrice: "10", taxRate: "20", discountAmount: "11" })).rejects.toMatchObject({ cause: { code: "23514" } });
    expect((await service.getInvoice(c, invoice.id)).items).toHaveLength(2);
    const counter = await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId));
    await expect(service.issueInvoice(c, invoice.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, c.organizationId))).toEqual(counter);
    await expect(service.updateBusinessDetails(c, created[1]!, fictionalBusinessDetails)).rejects.toMatchObject({ code: "NOT_FOUND" });
    try {
      await db.update(users).set({ status: "inactive" }).where(eq(users.id, c.userId));
      await expect(service.updateBusinessDetails(c, invoice.id, fictionalBusinessDetails)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(billing.updateInvoiceTerms(c, fictionalInvoiceTerms)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await db.update(users).set({ status: "active", role: "READ_ONLY" }).where(eq(users.id, c.userId));
      await expect(service.updateBusinessDetails(c, invoice.id, fictionalBusinessDetails)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(billing.updateInvoiceTerms(c, fictionalInvoiceTerms)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(users).set({ status: "active", role: "OWNER" }).where(eq(users.id, c.userId)); }
    await service.updateBusinessDetails(c, invoice.id, { ...fictionalBusinessDetails, purchaseOrderIssued: true, customerOrderReference: "BC-M3-FICTIF" });
    try {
      await billing.updateInvoiceTerms(c, { ...fictionalInvoiceTerms, b2bPenaltyRule: null });
      await expect(service.issueInvoice(c, invoice.id)).rejects.toMatchObject({ code: "CONFLICT" });
      await billing.updateInvoiceTerms(c, fictionalInvoiceTerms);
      const issued = await service.issueInvoice(c, invoice.id);
      expect(issued.documentSnapshot).toMatchObject({ version: 4, businessDetails: { executionDate: "2026-10-01", customerOrderReference: "BC-M3-FICTIF" }, paymentTerms: { recoveryIndemnityAmount: "40.00" }, totals: { subtotal: "200.00", taxAmount: "38.55", total: "238.55" } });
      const frozen = structuredClone(issued.documentSnapshot);
      await billing.updateInvoiceTerms(c, { ...fictionalInvoiceTerms, paymentTermsText: "Nouvelles conditions fictives" });
      expect((await service.getInvoiceDocument(c, invoice.id)).snapshot).toEqual(frozen);
      await expect(service.updateBusinessDetails(c, invoice.id, fictionalBusinessDetails)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(db.update(invoices).set({ businessDetails: fictionalBusinessDetails }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    } finally { await billing.updateInvoiceTerms(c, fictionalInvoiceTerms); }
  });
  const eventsFor = (id: string) => db.select().from(financialAuditEvents).where(eq(financialAuditEvents.entityId, id));
  it("M5A persists trusted issuance/correction/payment events exactly once with one transaction correlation", async () => {
    const c = contexts[0]!, invoice = await issued(), input = receipt("20");
    const issue = await eventsFor(invoice.id);
    expect(issue).toHaveLength(1); expect(issue[0]).toMatchObject({ organizationId: c.organizationId, actorUserId: c.userId, actorType: "user", eventType: "invoice.issued", metadata: { number: invoice.invoiceNumber } });
    await service.issueInvoice(c, invoice.id); expect(await eventsFor(invoice.id)).toHaveLength(1);
    const payment = (await paymentService.recordPayment(c, invoice.id, input)).payment;
    await paymentService.recordPayment(c, invoice.id, input);
    const recorded = await eventsFor(payment.id); expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ eventType: "payment.recorded", actorUserId: c.userId, organizationId: c.organizationId, metadata: { amount: "20.00", invoiceId: invoice.id } });
    const invoiceEvents = await eventsFor(invoice.id);
    expect(invoiceEvents.find(e => e.eventType === "invoice.status_changed")?.correlationId).toBe(recorded[0]!.correlationId);
    const note = await partial(invoice.id, "10"); await credits().issue(c, note.id); await credits().issue(c, note.id);
    expect(await eventsFor(note.id)).toEqual([expect.objectContaining({ eventType: "credit_note.issued", actorUserId: c.userId, organizationId: c.organizationId })]);
    await paymentService.cancelPayment(c, invoice.id, payment.id, { reason: "Erreur de saisie fictive M5A" });
    await paymentService.cancelPayment(c, invoice.id, payment.id, { reason: "Retry fictif" });
    expect((await eventsFor(payment.id)).map(e => e.eventType).sort()).toEqual(["payment.cancelled", "payment.recorded"]);
    expect(JSON.stringify(await eventsFor(payment.id))).not.toContain("Erreur de saisie"); // Reason retained on receipt, not duplicated in audit metadata.
  });
  it("M5A rejects issued invoice/item fiscal edits, soft-delete, physical delete and arbitrary statuses", async () => {
    const c = contexts[0]!, invoice = await issued(), item = (await service.getInvoice(c, invoice.id)).items[0]!;
    for (const patch of [{ invoiceNumber: "FAC-2026-999998" }, { issueDate: "2026-01-01" }, { issuedAt: new Date("2026-01-01") }, { documentSnapshot: null }, { subtotal: "90", total: "90", amountDue: "90" }, { deletedAt: new Date() }, { createdByUserId: userIds[1]! }, { status: "cancelled" as const }, { status: "paid" as const }]) await expect(db.update(invoices).set(patch).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.update(invoiceItems).set({ description: "Changed" }).where(eq(invoiceItems.id, item.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(invoiceItems).where(eq(invoiceItems.id, item.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(invoiceItems).values({ organizationId: c.organizationId, invoiceId: invoice.id, description: "Inserted after issue", quantity: "1", unitPrice: "1", taxRate: "0" })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(invoices).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    expect((await service.getInvoiceDocument(c, invoice.id)).snapshot).toEqual(invoice.documentSnapshot);
  });
  it("M5A rejects issued credit note/items edits and parent cascade deletion", async () => {
    const invoice = await issued(), note = await partial(invoice.id, "10"); await credits().issue(contexts[0]!, note.id);
    for (const patch of [{ number: "AV-2026-999998" }, { issueDate: "2026-01-01" }, { issuedAt: new Date() }, { snapshot: null }, { subtotal: "5", total: "5" }, { originalInvoiceId: created[1]! }]) await expect(db.update(creditNotes).set(patch).where(eq(creditNotes.id, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.update(creditNoteItems).set({ subtotal: "5", total: "5" }).where(eq(creditNoteItems.creditNoteId, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(creditNoteItems).where(eq(creditNoteItems.creditNoteId, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.insert(creditNoteItems).values({ organizationId: orgs[0]!, creditNoteId: note.id, originalInvoiceId: invoice.id, originalLineIndex: 1, subtotal: "1", total: "1" })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(creditNotes).where(eq(creditNotes.id, note.id))).rejects.toMatchObject({ cause: { code: "23514" } });
  });
  it("M5A makes payment history and audit append-only even on the privileged application connection", async () => {
    const c = contexts[0]!, invoice = await issued(), payment = (await paymentService.recordPayment(c, invoice.id, receipt())).payment;
    for (const patch of [{ amount: "1" }, { reference: "Rewritten" }, { invoiceId: created[0]! }, { paidAt: new Date() }]) await expect(db.update(payments).set(patch).where(eq(payments.id, payment.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(payments).where(eq(payments.id, payment.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    const event = (await eventsFor(payment.id))[0]!;
    await expect(db.update(financialAuditEvents).set({ metadata: { amount: "999" } }).where(eq(financialAuditEvents.id, event.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(financialAuditEvents).where(eq(financialAuditEvents.id, event.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.execute(sql`truncate public.financial_audit_events`)).rejects.toMatchObject({ cause: { code: "23514" } });
    await paymentService.cancelPayment(c, invoice.id, payment.id, { reason: "Correction fictive" });
    await expect(db.update(payments).set({ status: "completed", cancelledAt: null, cancelledByUserId: null, cancellationReason: null }).where(eq(payments.id, payment.id))).rejects.toMatchObject({ cause: { code: "23514" } });
  });
  it("M5A rolls back actual mutations and emitted success events together", async () => {
    const c = contexts[0]!, invoice = await service.createDraftInvoice(c, draft(customerIds[0]!));
    await service.addInvoiceItem(c, invoice.id, { description: "Rollback fictif", quantity: "1", unitPrice: "100", taxRate: "20" });
    const real = new InvoiceStore(db), failing = new InvoiceService({ ...store, invoices: real.invoices, customer: real.customer.bind(real), service: real.service.bind(real), quotes: real.quotes, jobs: real.jobs, timezone: real.timezone.bind(real), transaction: work => real.transaction(async s => { const update = s.invoices.update.bind(s.invoices); s.invoices.update = async (...args) => { await update(...args); throw new Error("After financial success trigger"); }; return work(s); }) });
    await expect(failing.issueInvoice(c, invoice.id)).rejects.toThrow("After financial success trigger");
    expect(await eventsFor(invoice.id)).toEqual([]); expect((await service.getInvoice(c, invoice.id)).status).toBe("draft");
    const ready = await service.issueInvoice(c, invoice.id), credit = await partial(ready.id, "10"), cs = new CreditNoteStore(db);
    const failedCredit = new CreditNoteService({ creditNotes: cs.creditNotes, transaction: work => cs.transaction(async s => { s.invoices.update = async () => { throw new Error("Credit rollback"); }; return work(s); }) });
    await expect(failedCredit.issue(c, credit.id)).rejects.toThrow("Credit rollback"); expect(await eventsFor(credit.id)).toEqual([]); expect((await credits().getCreditNote(c, credit.id)).status).toBe("draft");
    const ps = new PaymentStore(db), failedPayment = new PaymentService({ invoices: ps.invoices, payments: ps.payments, transaction: work => ps.transaction(async s => { s.invoices.update = async () => { throw new Error("Payment rollback"); }; return work(s); }) });
    await expect(failedPayment.recordPayment(c, ready.id, receipt())).rejects.toThrow("Payment rollback");
    expect(await ps.payments.list({ organizationId: c.organizationId, invoiceId: ready.id }, { limit: 100, offset: 0 })).toEqual([]);
    expect(await db.select().from(financialAuditEvents).where(sql`${financialAuditEvents.metadata}->>'invoiceId' = ${ready.id}`)).toEqual([]);
    expect(await eventsFor(ready.id)).toHaveLength(1); // Only committed issuance, no settlement success.
  });
  it("M5A protects tenant/RLS/UUID reads, anonymous and revoked memberships; users cannot append audit", async () => {
    const pair = await Promise.all([issued(0), issued(1)]), event = (await eventsFor(pair[1]!.id))[0]!, audit = new FinancialAuditService(store);
    expect(await store.transaction(s => s.financialAudit.get(orgs[0]!, event.id))).toBeUndefined();
    for (let n = 0; n < 2; n++) {
      const own = await clients[n]!.from("financial_audit_events").select("id,organization_id"); expect(own.error).toBeNull(); expect(own.data!.length).toBeGreaterThan(0); expect(own.data!.every(e => e.organization_id === orgs[n])).toBe(true);
      expect((await clients[n]!.from("financial_audit_events").select("id").eq("entity_id", pair[1-n]!.id)).data).toEqual([]);
    }
    expect((await clients[0]!.from("financial_audit_events").select("id").eq("id", event.id)).data).toEqual([]);
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
    expect((await anon.from("financial_audit_events").select("id")).data).toEqual([]);
    for (const client of [clients[0]!, admin]) { const result = await client.from("financial_audit_events").insert({ organization_id: orgs[0], entity_type: "invoice", entity_id: pair[0]!.id, event_type: "invoice.issued", actor_user_id: userIds[0], correlation_id: randomUUID(), metadata: {} }); expect(result.error).not.toBeNull(); }
    try {
      for (const patch of [{ role: "TECHNICIAN" as const }, { role: "READ_ONLY" as const }, { role: "OWNER" as const, status: "inactive" }, { status: "active", deletedAt: new Date() }]) {
        await db.update(users).set(patch).where(eq(users.id, userIds[0]!));
        expect((await clients[0]!.from("financial_audit_events").select("id")).data).toEqual([]);
        await expect(audit.list(contexts[0]!)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    } finally { await db.update(users).set({ role: "OWNER", status: "active", deletedAt: null }).where(eq(users.id, userIds[0]!)); }
    expect((await audit.list(contexts[0]!, { limit: 1 })).length).toBe(1);
  });
  it("M5A records cancellations and billing configuration without duplicating identities or legal text", async () => {
    const c = contexts[0]!, d = await service.createDraftInvoice(c, draft(customerIds[0]!)); await service.cancelInvoice(c, d.id);
    expect((await eventsFor(d.id))[0]?.eventType).toBe("invoice.cancelled");
    const invoice = await issued(), note = await partial(invoice.id, "1"); await credits().cancel(c, note.id);
    expect((await eventsFor(note.id))[0]?.eventType).toBe("credit_note.cancelled");
    const billing = new BillingIdentityService(store); await billing.updateInvoiceTerms(c, fictionalInvoiceTerms);
    const config = (await eventsFor(c.organizationId)).filter(e => e.eventType === "billing.terms_changed").at(-1)!;
    expect(config.metadata).toEqual({ fields: Object.keys(fictionalInvoiceTerms) });
    expect(JSON.stringify(config.metadata)).not.toContain(fictionalInvoiceTerms.paymentTermsText);
  });
  it("M5A refuses forged cross-tenant audit resources and receipt commits without balance synchronization", async () => {
    const c = contexts[0]!, invoice = await issued(), other = await issued(1);
    await expect(store.transaction(async s => {
      await s.membership(c);
      await s.financialAudit.configuration(c, "customer", customerIds[1]!, "billing.customer_changed", ["billingName"]);
    })).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.transaction(async tx => {
      await new InvoiceSession(tx, true).membership(c);
      await tx.execute(sql`insert into public.financial_audit_events (organization_id,entity_type,entity_id,event_type,actor_user_id,correlation_id,metadata) values (${c.organizationId}::uuid,'invoice',${other.id}::uuid,'invoice.issued',${c.userId}::uuid,current_setting('first_ai.correlation')::uuid,'{}'::jsonb)`);
    })).rejects.toMatchObject({ cause: { code: "23514", message: "Financial audit resource must belong to actor tenant" } });
    const ps = new PaymentStore(db), input = receipt("1");
    await expect(ps.transaction(async s => {
      await s.membership(c);
      await s.payments.create({ ...input, paidAt: new Date(input.paidAt), organizationId: c.organizationId, invoiceId: invoice.id, customerId: invoice.customerId, createdByUserId: c.userId, method: "bank_transfer" });
    })).rejects.toThrow("Financial mutation must commit with its derived balance");
    expect(await ps.payments.byKey(c.organizationId, input.idempotencyKey)).toBeUndefined();
    expect(await eventsFor(invoice.id)).toHaveLength(1);
  });
  it("M5A allows only audited administrative notes while leaving the issued commercial document intact", async () => {
    const c = contexts[0]!, invoice = await issued(), saved = structuredClone(invoice.documentSnapshot);
    await expect(db.update(invoices).set({ internalNotes: "Uncontrolled" }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    const changed = await service.updateAdministrativeMetadata(c, invoice.id, { internalNotes: "Note interne fictive" });
    expect(changed.documentSnapshot).toEqual(saved);
    expect((await eventsFor(invoice.id)).find(e => e.eventType === "invoice.metadata_changed")?.metadata).toEqual({ fields: ["internalNotes"] });
    await expect(service.updateAdministrativeMetadata(c, created[1]!, { internalNotes: "Foreign" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    try {
      await db.update(users).set({ role: "ACCOUNTANT" }).where(eq(users.id, c.userId));
      await expect(service.updateAdministrativeMetadata(c, invoice.id, { internalNotes: "Forbidden" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { await db.update(users).set({ role: "OWNER" }).where(eq(users.id, c.userId)); }
  });
});
