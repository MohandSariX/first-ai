import { randomUUID } from "node:crypto";
import { createAdminSupabaseClient } from "@first-ai/auth/admin";
import type { CurrentBusinessUser } from "@first-ai/auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDatabaseClient, customerSites, customers, jobReports, jobs, OperationalStore, organizations, quoteItems, quotes, services, users, approvalRequests, agentToolCalls, agentRuns, agents, ApprovalRepository, AgentObservabilityRepository } from "@first-ai/database";
import { createClient } from "@supabase/supabase-js";
import { ApprovalService } from "./approval-service.js";
import { JobReportService, JobService, QuoteService } from "./operational-services.js";
import { createOperationalToolRegistry } from "./operational-tools.js";

const a = randomUUID(), b = randomUUID(), userA = randomUUID(), userB = randomUUID(), technicianA = randomUUID(), customerA = randomUUID(), customerB = randomUUID(), siteA = randomUUID(), siteB = randomUUID(), serviceA = randomUUID(), serviceB = randomUUID();
const c: CurrentBusinessUser = { organizationId: a, userId: userA, authUserId: randomUUID(), role: "OWNER" };
describe("local operational transactions and scoped privileged queries", () => {
  let db: ReturnType<typeof createDatabaseClient>, store: OperationalStore, q: QuoteService, j: JobService, r: JobReportService;
  let firstQuote: string, foreignQuote: string, foreignJob: string;
  let context: CurrentBusinessUser = c;
  let admin: ReturnType<typeof createAdminSupabaseClient> | undefined;
  const authIds: string[] = [];
  const passwords: string[] = [];
  let approvals: ApprovalService, runId:string;
  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "missing").hostname;
    if (!["127.0.0.1", "localhost"].includes(hostname)) throw new Error("Operational integration refuses non-local database.");
    if (!["127.0.0.1", "localhost"].includes(new URL(process.env.SUPABASE_URL ?? "missing").hostname)) throw new Error("Operational integration refuses non-local Auth.");
    admin = createAdminSupabaseClient();
    for (const email of [`owner-${a}@example.test`, `owner-${b}@example.test`, `tech-${a}@example.test`]) {
      const password = `Fictional-${randomUUID()}`; passwords.push(password);
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error) throw new Error(result.error.message); authIds.push(result.data.user.id);
    }
    context = { ...c, authUserId: authIds[0]! };
    db = createDatabaseClient(); store = new OperationalStore(db); q = new QuoteService(store); j = new JobService(store); r = new JobReportService(store);
    await db.insert(organizations).values([{ id: a, name: "Fictional Operations A" }, { id: b, name: "Fictional Operations B" }]);
    await db.insert(users).values([{ id: userA, organizationId: a, authUserId: authIds[0]!, firstName: "Test", lastName: "Owner A", email: `owner-${a}@example.test`, role: "OWNER" }, { id: userB, organizationId: b, authUserId: authIds[1]!, firstName: "Test", lastName: "Owner B", email: `owner-${b}@example.test`, role: "OWNER" }, { id: technicianA, organizationId: a, authUserId: authIds[2]!, firstName: "Test", lastName: "Technician A", email: `tech-${a}@example.test`, role: "TECHNICIAN" }]);
    await db.insert(customers).values([{ id: customerA, organizationId: a, name: "Fictional Customer A", type: "company" }, { id: customerB, organizationId: b, name: "Fictional Customer B", type: "company" }]);
    await db.insert(customerSites).values([{ id: siteA, organizationId: a, customerId: customerA, name: "Fictional Site A", addressLine1: "1 Test Street", postalCode: "75001", city: "Paris" }, { id: siteB, organizationId: b, customerId: customerB, name: "Fictional Site B", addressLine1: "2 Test Street", postalCode: "75002", city: "Paris" }]);
    await db.insert(services).values([{ id: serviceA, organizationId: a, code: "TEST", name: "Fictional Service A", pricingMode: "fixed" }, { id: serviceB, organizationId: b, code: "TEST", name: "Fictional Service B", pricingMode: "fixed" }]);
    const other = { ...context, organizationId: b, userId: userB, authUserId: authIds[1]! };
    foreignQuote = (await q.createDraftQuote(other, { customerId: customerB, siteId: siteB })).id;
    foreignJob = (await j.createDraftJob(other, { customerId: customerB, siteId: siteB, serviceId: serviceB, description: "Fictional other job" })).id;
    approvals = new ApprovalService(new ApprovalRepository(db));
    const observability = new AgentObservabilityRepository(db); const agentId=await observability.ensureDirector(a,{code:"pricing",name:"Pricing"});runId=randomUUID();
    await observability.createRun({id:runId,organizationId:a,agentId,triggeredByType:"user",triggeredById:userA,objective:"Fictional specialist validation",modelName:"mock",status:"completed",correlationId:randomUUID()});
  });
  afterAll(async () => {
    const errors: unknown[] = [];
    const clean = async (operation: PromiseLike<unknown>) => { try { await operation; } catch (error) { errors.push(error); } };
    try {
      if (db) for (const org of [a, b]) {
        for (const table of [approvalRequests,agentToolCalls,agentRuns,agents,jobReports, jobs, quoteItems, quotes, customerSites, services, customers, users]) await clean(db.delete(table).where(eq(table.organizationId, org)));
        await clean(db.delete(organizations).where(eq(organizations.id, org)));
      }
    } finally {
      if (db) await clean(db.$client.end());
      for (const id of authIds) { const result = await admin!.auth.admin.deleteUser(id); if (result.error) errors.push(new Error(result.error.message)); }
    }
    if (errors.length) throw new AggregateError(errors, "Local operational test cleanup failed.");
  });
  it("allocates sequential unique quote numbers under concurrent creation", async () => { const results = await Promise.all([q.createDraftQuote(context, { customerId: customerA, siteId: siteA }), q.createDraftQuote(context, { customerId: customerA, siteId: siteA })]); const year = new Date().getFullYear(); expect(results.map(v => v.quoteNumber).sort()).toEqual([`DEV-${year}-000001`, `DEV-${year}-000002`]); firstQuote = results[0]!.id; });
  it("uses tenant scoping even on privileged exact-ID reads, updates and tools", async () => {
    await expect(q.getQuote(context, foreignQuote)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(j.getJob(context, foreignJob)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await store.quotes.update({ organizationId: a, quoteId: foreignQuote }, { notes: "Attack" })).toBeUndefined();
    expect(await store.jobs.update({ organizationId: a, jobId: foreignJob }, { status: "cancelled" })).toBeUndefined();
    const tools = createOperationalToolRegistry({ quotes: q, jobs: j, reports: r });
    for (const [name, input] of [["quotes.get", { quoteId: foreignQuote }], ["jobs.get", { jobId: foreignJob }]] as const) expect(await tools[name]!.execute({ ...context, correlationId: randomUUID() }, input)).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
  it("rejects cross-tenant and same-tenant wrong-customer relations at PostgreSQL level", async () => {
    for (const input of [{ customerId: customerB, siteId: siteA }, { customerId: customerA, siteId: siteB }]) await expect(db.insert(quotes).values({ organizationId: a, createdByUserId: userA, quoteNumber: `TEST-${randomUUID().slice(0, 16)}`, ...input })).rejects.toMatchObject({ cause: { code: "23503" } });
    const otherCustomer = randomUUID(); await db.insert(customers).values({ id: otherCustomer, organizationId: a, name: "Fictional Wrong Customer", type: "company" });
    await expect(db.insert(quotes).values({ organizationId: a, createdByUserId: userA, quoteNumber: `TEST-${randomUUID().slice(0, 16)}`, customerId: otherCustomer, siteId: siteA })).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(db.insert(quoteItems).values({ organizationId: a, quoteId: firstQuote, serviceId: serviceB, description: "Invalid service", quantity: "1", unitPrice: "1", taxRate: "20" })).rejects.toMatchObject({ cause: { code: "23503" } });
    for (const input of [{ customerId: customerB }, { siteId: siteB }, { quoteId: foreignQuote }, { serviceId: serviceB }, { assignedUserId: userB }]) await expect(db.insert(jobs).values({ organizationId: a, createdByUserId: userA, customerId: customerA, siteId: siteA, serviceId: serviceA, description: "Invalid job", ...input })).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(db.insert(jobReports).values({ organizationId: a, jobId: foreignJob, technicianId: userA })).rejects.toMatchObject({ cause: { code: "23503" } });
  });
  it("atomically calculates, accepts and creates exactly one draft job under concurrent acceptance", async () => {
    await q.addQuoteItem(context, firstQuote, { serviceId: serviceA, description: "Fictional Treatment", quantity: "2", unitPrice: "100", taxRate: "20", costEstimate: "30" });
    expect(await q.getQuote(context, firstQuote)).toMatchObject({ subtotal: "200.00", taxAmount: "40.00", total: "240.00", estimatedCost: "60.00", estimatedMargin: "140.00" });
    await q.markQuoteReady(context, firstQuote);
    const [one, two] = await Promise.all([q.acceptQuoteAndCreateJob(context, firstQuote, { serviceId: serviceA }), q.acceptQuoteAndCreateJob(context, firstQuote, { serviceId: serviceA })]);
    expect(one.job.id).toBe(two.job.id); expect(one.quote.status).toBe("accepted"); expect(one.quote.acceptedAt).toBeInstanceOf(Date);
    expect(one.job).toMatchObject({ organizationId: a, customerId: customerA, siteId: siteA, quoteId: firstQuote, serviceId: serviceA, status: "draft", price: "200.00", estimatedCost: "60.00" });
    expect(await db.select().from(jobs).where(and(eq(jobs.organizationId, a), eq(jobs.quoteId, firstQuote)))).toHaveLength(1);
  });
  it("rolls back item and totals together if calculation exceeds storage bounds", async () => { const draft = await q.createDraftQuote(context, { customerId: customerA, siteId: siteA }); await expect(q.addQuoteItem(context, draft.id, { description: "Too large fictional item", quantity: "999999", unitPrice: "9999999999.99", taxRate: "20" })).rejects.toThrow(); expect((await q.getQuote(context, draft.id)).items).toEqual([]); expect((await q.getQuote(context, draft.id)).total).toBe("0.00"); });
  it("rolls back acceptance if the job insert fails", async () => {
    const draft = await q.createDraftQuote(context, { customerId: customerA, siteId: siteA });
    await q.addQuoteItem(context, draft.id, { serviceId: serviceA, description: "Fictional rollback item", quantity: "1", unitPrice: "10", taxRate: "20" });
    await q.markQuoteReady(context, draft.id);
    // Deliberate test-only corruption: occupy the unique quote/job link before acceptance.
    await db.insert(jobs).values({ organizationId: a, customerId: customerA, siteId: siteA, serviceId: serviceA, quoteId: draft.id, description: "Test fault injection", createdByUserId: userA });
    await expect(q.acceptQuoteAndCreateJob(context, draft.id, { serviceId: serviceA })).rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await q.getQuote(context, draft.id)).toMatchObject({ status: "ready", acceptedAt: null });
  });
  it("supports assigned technician scheduling, own report and completion", async () => {
    const job = (await q.acceptQuoteAndCreateJob(context, firstQuote, { serviceId: serviceA })).job;
    await j.assignTechnician(context, job.id, { assignedUserId: technicianA }); await j.scheduleJob(context, job.id, { scheduledStart: "2026-11-12T10:00:00Z", scheduledEnd: "2026-11-12T11:00:00Z" });
    const tech = { ...context, authUserId: authIds[2]!, userId: technicianA, role: "TECHNICIAN" as const };
    await j.startJob(tech, job.id); await r.createJobReportDraft(tech, { jobId: job.id });
    await expect(j.completeJob(tech, job.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await r.updateJobReport(tech, job.id, { observations: "Fictional observation", treatmentPerformed: "Fictional treatment", infestationLevelBefore: "high", infestationLevelAfter: "low" });
    await r.scheduleFollowUpRecommendation(tech, job.id, { followUpDate: "2026-11-26" }); await r.completeJobReport(tech, job.id);
    expect(await j.completeJob(tech, job.id)).toMatchObject({ status: "follow_up_required", actualStart: expect.any(Date), actualEnd: expect.any(Date) });
    expect((await j.searchJobs(tech, {})).every(v => v.job.assignedUserId === technicianA)).toBe(true);
  });
  it("rejects conflicting technician assignments but permits back-to-back schedules", async () => { const one = await j.createDraftJob(context, { customerId: customerA, siteId: siteA, serviceId: serviceA, description: "Test overlap 1" }), two = await j.createDraftJob(context, { customerId: customerA, siteId: siteA, serviceId: serviceA, description: "Test overlap 2" }); await j.assignTechnician(context, one.id, { assignedUserId: technicianA }); await j.assignTechnician(context, two.id, { assignedUserId: technicianA }); await j.scheduleJob(context, one.id, { scheduledStart: "2026-12-01T10:00:00Z", scheduledEnd: "2026-12-01T11:00:00Z" }); await expect(j.scheduleJob(context, two.id, { scheduledStart: "2026-12-01T10:30:00Z", scheduledEnd: "2026-12-01T11:30:00Z" })).rejects.toMatchObject({ code: "CONFLICT" }); await j.scheduleJob(context, two.id, { scheduledStart: "2026-12-01T11:00:00Z", scheduledEnd: "2026-12-01T12:00:00Z" }); });
  const proposalContext = () => ({...context,agentRunId:runId,correlationId:randomUUID()});
  it("approves a pricing proposal once under concurrent double approval",async () => {
    const proposal=await approvals.createProposal(proposalContext(),"pricing","quotes.createDraft",{customerId:customerA,siteId:siteA});
    await expect(db.insert(approvalRequests).values({...proposal,id:randomUUID(),riskLevel:3})).rejects.toMatchObject({cause:{code:"23514"}});
    const before=await q.searchQuotes(context,{});
    const [one,two]=await Promise.all([approvals.decide(proposal.id,"approve",async()=>context),approvals.decide(proposal.id,"approve",async()=>context)]);
    expect(one.status).toBe("executed");expect(two.result).toEqual(one.result);expect((await q.searchQuotes(context,{})).length).toBe(before.length+1);
    const line=await approvals.createProposal(proposalContext(),"pricing","quotes.addItem",{quoteId:one.result!.resourceId,description:"Fictional proposed item",quantity:"2",unitPrice:"100.10",taxRate:"20",costEstimate:"30"});
    expect((await q.getQuote(context,one.result!.resourceId)).items).toHaveLength(0);
    await approvals.decide(line.id,"approve",async()=>context);
    expect(await q.calculateQuote(context,one.result!.resourceId)).toMatchObject({subtotal:"200.20",taxAmount:"40.04",estimatedMargin:"140.20"});
  });
  it("rejects, expires and rejects stale quotes without any mutation",async () => {
    const draft=await q.createDraftQuote(context,{customerId:customerA,siteId:siteA});
    const make=()=>approvals.createProposal(proposalContext(),"pricing","quotes.addItem",{quoteId:draft.id,description:"Fictional stale line",quantity:"1",unitPrice:"10",taxRate:"20"});
    const rejected=await make();expect((await approvals.decide(rejected.id,"reject",async()=>context)).status).toBe("rejected");await expect(approvals.decide(rejected.id,"approve",async()=>context)).rejects.toMatchObject({code:"CONFLICT"});
    const expired=await make();await db.update(approvalRequests).set({expiresAt:new Date(0)}).where(eq(approvalRequests.id,expired.id));expect((await approvals.decide(expired.id,"approve",async()=>context)).status).toBe("expired");
    const stale=await make();await q.updateDraftQuote(context,draft.id,{notes:"Fictional changed state"});expect(await approvals.decide(stale.id,"approve",async()=>context)).toMatchObject({status:"failed",errorCode:"STALE_PROPOSAL"});expect((await q.getQuote(context,draft.id)).items).toHaveLength(0);
    const overflow=await approvals.createProposal(proposalContext(),"pricing","quotes.addItem",{quoteId:draft.id,description:"Fictional overflow rollback",quantity:"999999",unitPrice:"9999999999.99",taxRate:"20"});
    expect((await approvals.decide(overflow.id,"approve",async()=>context)).status).toBe("failed");
    expect(await q.getQuote(context,draft.id)).toMatchObject({items:[],total:"0.00"});
    await expect(approvals.decide(overflow.id,"approve",async()=>context)).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("revalidates active membership and role despite a stale server context",async () => {
    const p=await approvals.createProposal(proposalContext(),"pricing","quotes.createDraft",{customerId:customerA,siteId:siteA});
    try {
      await db.update(users).set({status:"inactive"}).where(eq(users.id,userA));await expect(approvals.decide(p.id,"approve",async()=>context)).rejects.toMatchObject({code:"FORBIDDEN"});
      await db.update(users).set({status:"active",deletedAt:new Date()}).where(eq(users.id,userA));await expect(approvals.decide(p.id,"approve",async()=>context)).rejects.toMatchObject({code:"FORBIDDEN"});
      for (const role of ["READ_ONLY","ACCOUNTANT","TECHNICIAN"] as const) {await db.update(users).set({status:"active",deletedAt:null,role}).where(eq(users.id,userA));await expect(approvals.decide(p.id,"approve",async()=>context)).rejects.toMatchObject({code:"FORBIDDEN"});}
    } finally {await db.update(users).set({status:"active",deletedAt:null,role:"OWNER"}).where(eq(users.id,userA));}
  });
  it("blocks known cross-tenant resource/proposal UUIDs and proposal SQL writes via RLS",async () => {
    await expect(approvals.createProposal(proposalContext(),"pricing","quotes.addItem",{quoteId:foreignQuote,description:"Attack",quantity:"1",unitPrice:"1",taxRate:"0"})).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(approvals.createProposal(proposalContext(),"planning","jobs.schedule",{jobId:foreignJob,scheduledStart:"2027-01-01T10:00:00Z",scheduledEnd:"2027-01-01T11:00:00Z"})).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(approvals.createProposal(proposalContext(),"pricing","quotes.createDraft",{customerId:customerB,siteId:siteB})).rejects.toMatchObject({code:"NOT_FOUND"});
    const proposal=await approvals.createProposal(proposalContext(),"pricing","quotes.createDraft",{customerId:customerA,siteId:siteA});
    const other={...context,userId:userB,organizationId:b,authUserId:authIds[1]!};await expect(approvals.decide(proposal.id,"approve",async()=>other)).rejects.toMatchObject({code:"NOT_FOUND"});
    const clients= [createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})];
    for(const [idx,email] of [`owner-${a}@example.test`,`owner-${b}@example.test`].entries()) {const result=await clients[idx]!.auth.signInWithPassword({email,password:passwords[idx]!});expect(result.error).toBeNull();}
    expect((await clients[0]!.from("approval_requests").select("id").eq("id",proposal.id)).data).toHaveLength(1);
    expect((await clients[1]!.from("approval_requests").select("id").eq("id",proposal.id)).data).toEqual([]);
    expect((await createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!).from("approval_requests").select("id")).data).toEqual([]);
    expect((await clients[0]!.from("approval_requests").update({status:"executed"}).eq("id",proposal.id).select("id")).data).toEqual([]);
    expect((await admin!.from("approval_requests").select("id").eq("id",proposal.id)).data).toHaveLength(1);
  });
  it("planning approval invokes deterministic scheduling and fails on newly conflicting schedules",async () => {
    const makeJob=()=>j.createDraftJob(context,{customerId:customerA,siteId:siteA,serviceId:serviceA,description:"Fictional planning proposal"});
    const one=await makeJob(),two=await makeJob();
    for(const job of [one,two]) {const p=await approvals.createProposal(proposalContext(),"planning","jobs.assignTechnician",{jobId:job.id,assignedUserId:technicianA});expect((await approvals.decide(p.id,"approve",async()=>context)).status).toBe("executed");}
    const slot={scheduledStart:"2027-01-12T10:00:00Z",scheduledEnd:"2027-01-12T11:00:00Z"};
    const proposed=await approvals.createProposal(proposalContext(),"planning","jobs.schedule",{jobId:two.id,...slot});
    expect(proposed.riskLevel).toBe(2);
    const first=await approvals.createProposal(proposalContext(),"planning","jobs.schedule",{jobId:one.id,...slot});expect((await approvals.decide(first.id,"approve",async()=>context)).status).toBe("executed");
    expect(await approvals.decide(proposed.id,"approve",async()=>context)).toMatchObject({status:"failed",errorCode:"CONFLICT"});expect((await j.getJob(context,two.id)).status).toBe("draft");
  });
  it("technician proposals stay assigned and complete the report workflow only after approval",async () => {
    const tech={...context,userId:technicianA,authUserId:authIds[2]!,role:"TECHNICIAN" as const};
    const job=await j.createDraftJob(context,{customerId:customerA,siteId:siteA,serviceId:serviceA,description:"Fictional technician proposal"});
    await j.assignTechnician(context,job.id,{assignedUserId:technicianA});await j.scheduleJob(context,job.id,{scheduledStart:"2027-02-01T10:00:00Z",scheduledEnd:"2027-02-01T11:00:00Z"});
    const tc={...tech,agentRunId:runId,correlationId:randomUUID()};
    const start=await approvals.createProposal(tc,"technician","jobs.start",{jobId:job.id});expect((await j.getJob(tech,job.id)).status).toBe("scheduled");await approvals.decide(start.id,"approve",async()=>tech);
    for(const [name,input] of [["reports.createDraft",{jobId:job.id}],["reports.update",{jobId:job.id,observations:"Fictional human observation",treatmentPerformed:"Fictional human-provided treatment"}],["reports.complete",{jobId:job.id}],["jobs.complete",{jobId:job.id}]] as const) {const p=await approvals.createProposal(tc,"technician",name,input);expect((await approvals.decide(p.id,"approve",async()=>tech)).status).toBe("executed");}
    expect((await j.getJob(tech,job.id)).status).toBe("completed");
    const unrelated=await j.createDraftJob(context,{customerId:customerA,siteId:siteA,serviceId:serviceA,description:"Unrelated fictional job"});await expect(approvals.createProposal(tc,"technician","jobs.start",{jobId:unrelated.id})).rejects.toMatchObject({code:"NOT_FOUND"});
    await j.assignTechnician(context,unrelated.id,{assignedUserId:technicianA});await j.scheduleJob(context,unrelated.id,{scheduledStart:"2027-02-02T10:00:00Z",scheduledEnd:"2027-02-02T11:00:00Z"});
    const revokedAssignment=await approvals.createProposal(tc,"technician","jobs.start",{jobId:unrelated.id});await j.assignTechnician(context,unrelated.id,{assignedUserId:null});expect(await approvals.decide(revokedAssignment.id,"approve",async()=>tech)).toMatchObject({status:"failed",errorCode:"NOT_FOUND"});expect((await j.getJob(context,unrelated.id)).status).toBe("scheduled");
  });
});
