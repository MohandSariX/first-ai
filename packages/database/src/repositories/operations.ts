import { and, count, desc, eq, gt, gte, ilike, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import type { CreateDraftQuoteInput } from "@first-ai/schemas";
import type { createDatabaseClient } from "../client.js";
import { customers, customerSites, jobs, jobReports, organizations, quoteItems, quotes, services, users } from "../schema/index.js";

type Database = ReturnType<typeof createDatabaseClient>;
type Session = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobReport = typeof jobReports.$inferSelect;
export interface OrganizationScope { organizationId: string }
export interface QuoteScope extends OrganizationScope { quoteId: string }
export interface JobScope extends OrganizationScope { jobId: string }
export interface OperationalSearch extends OrganizationScope { query?: string; limit: number; offset: number }
const bounded = (v: number) => Math.min(Math.max(v, 1), 100);
const offset = (v: number) => Math.min(Math.max(v, 0), 10000);
const quoteWhere = (s: QuoteScope) => and(eq(quotes.organizationId, s.organizationId), eq(quotes.id, s.quoteId), isNull(quotes.deletedAt));
const jobWhere = (s: JobScope) => and(eq(jobs.organizationId, s.organizationId), eq(jobs.id, s.jobId), isNull(jobs.deletedAt));
function row<T>(v: T | undefined): T { if (v === undefined) throw new Error("Persistence operation returned no row."); return v; }

export class QuoteRepository {
  constructor(private readonly db: Session, private readonly isTransactional = false) {}
  async get(scope: QuoteScope, lock = false) { const q = this.db.select().from(quotes).where(quoteWhere(scope)).limit(1); return (await (lock ? q.for("update") : q))[0]; }
  async search(s: OperationalSearch & { status?: Quote["status"]; customerId?: string }) {
    const conditions: SQL[] = [eq(quotes.organizationId, s.organizationId), isNull(quotes.deletedAt)];
    if (s.status) conditions.push(eq(quotes.status, s.status));
    if (s.customerId) conditions.push(eq(quotes.customerId, s.customerId));
    if (s.query) conditions.push(or(ilike(quotes.quoteNumber, `%${s.query}%`), ilike(customers.name, `%${s.query}%`))!);
    return this.db.select({ quote: quotes, customerName: customers.name, siteName: customerSites.name }).from(quotes).innerJoin(customers, and(eq(customers.id, quotes.customerId), eq(customers.organizationId, s.organizationId))).innerJoin(customerSites, and(eq(customerSites.id, quotes.siteId), eq(customerSites.organizationId, s.organizationId))).where(and(...conditions)).orderBy(desc(quotes.createdAt), quotes.id).limit(bounded(s.limit)).offset(offset(s.offset));
  }
  // Must run in a transaction. Locking the organization serializes number allocation,
  // including across processes, without a fifth business table. Soft-deleted numbers stay reserved.
  async create(organizationId: string, createdByUserId: string, input: CreateDraftQuoteInput, year: number) {
    if (!this.isTransactional) throw new Error("Quote number allocation requires a transaction.");
    row((await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update"))[0]);
    const prefix = `DEV-${year}-`;
    const previous = (await this.db.select({ number: quotes.quoteNumber }).from(quotes).where(and(eq(quotes.organizationId, organizationId), ilike(quotes.quoteNumber, `${prefix}%`))).orderBy(desc(quotes.quoteNumber)).limit(1))[0];
    const next = previous ? Number(previous.number.slice(prefix.length)) + 1 : 1;
    if (!Number.isSafeInteger(next) || next > 999999) throw new Error("Quote numbering capacity exceeded.");
    return row((await this.db.insert(quotes).values({ organizationId, createdByUserId, ...input, quoteNumber: `${prefix}${String(next).padStart(6, "0")}` }).returning())[0]);
  }
  async update(scope: QuoteScope, input: Partial<Pick<Quote, "notes" | "validUntil" | "status" | "acceptedAt" | "rejectedAt" | "subtotal" | "taxAmount" | "total" | "estimatedCost" | "estimatedMargin" | "estimatedMarginRate">>) { return (await this.db.update(quotes).set({ ...input, updatedAt: new Date() }).where(quoteWhere(scope)).returning())[0]; }
  async items(scope: QuoteScope) { return this.db.select().from(quoteItems).where(and(eq(quoteItems.organizationId, scope.organizationId), eq(quoteItems.quoteId, scope.quoteId))).orderBy(quoteItems.sortOrder, quoteItems.createdAt).limit(201); }
  async addItem(scope: QuoteScope, input: Omit<typeof quoteItems.$inferInsert, "id" | "organizationId" | "quoteId" | "createdAt" | "updatedAt">) { return row((await this.db.insert(quoteItems).values({ ...input, organizationId: scope.organizationId, quoteId: scope.quoteId }).returning())[0]); }
  async updateItem(scope: QuoteScope, itemId: string, input: Partial<Pick<QuoteItem, "serviceId" | "description" | "quantity" | "unitPrice" | "taxRate" | "costEstimate" | "sortOrder">>) { return (await this.db.update(quoteItems).set({ ...input, updatedAt: new Date() }).where(and(eq(quoteItems.organizationId, scope.organizationId), eq(quoteItems.quoteId, scope.quoteId), eq(quoteItems.id, itemId))).returning())[0]; }
  async removeItem(scope: QuoteScope, itemId: string) { return (await this.db.delete(quoteItems).where(and(eq(quoteItems.organizationId, scope.organizationId), eq(quoteItems.quoteId, scope.quoteId), eq(quoteItems.id, itemId))).returning())[0]; }
  async countPending(organizationId: string) { const [r] = await this.db.select({ value: count() }).from(quotes).where(and(eq(quotes.organizationId, organizationId), isNull(quotes.deletedAt), or(eq(quotes.status, "ready"), eq(quotes.status, "sent"), eq(quotes.status, "viewed")))); return r?.value ?? 0; }
}

export class JobRepository {
  constructor(private readonly db: Session) {}
  async get(scope: JobScope, lock = false) { const q = this.db.select().from(jobs).where(jobWhere(scope)).limit(1); return (await (lock ? q.for("update") : q))[0]; }
  async getByQuote(scope: QuoteScope) { return (await this.db.select().from(jobs).where(and(eq(jobs.organizationId, scope.organizationId), eq(jobs.quoteId, scope.quoteId), isNull(jobs.deletedAt))).limit(1))[0]; }
  async countToday(s: OrganizationScope & { from: Date; until: Date; assignedUserId?: string }) { const [r] = await this.db.select({ value: count() }).from(jobs).where(and(eq(jobs.organizationId, s.organizationId), isNull(jobs.deletedAt), gte(jobs.scheduledStart, s.from), lt(jobs.scheduledStart, s.until), s.assignedUserId ? eq(jobs.assignedUserId, s.assignedUserId) : undefined)); return r?.value ?? 0; }
  async search(s: OperationalSearch & { status?: Job["status"]; from?: Date; until?: Date; customerId?: string; assignedUserId?: string }) {
    const conditions: SQL[] = [eq(jobs.organizationId, s.organizationId), isNull(jobs.deletedAt)];
    if (s.status) conditions.push(eq(jobs.status, s.status));
    if (s.customerId) conditions.push(eq(jobs.customerId, s.customerId));
    if (s.assignedUserId) conditions.push(eq(jobs.assignedUserId, s.assignedUserId));
    if (s.from) conditions.push(gte(jobs.scheduledStart, s.from));
    if (s.until) conditions.push(lt(jobs.scheduledStart, s.until));
    if (s.query) conditions.push(or(ilike(jobs.description, `%${s.query}%`), ilike(customers.name, `%${s.query}%`), ilike(customerSites.name, `%${s.query}%`))!);
    return this.db.select({ job: jobs, customerName: customers.name, siteName: customerSites.name, serviceName: services.name, technicianFirstName: users.firstName, technicianLastName: users.lastName }).from(jobs).innerJoin(customers, and(eq(customers.id, jobs.customerId), eq(customers.organizationId, s.organizationId))).innerJoin(customerSites, and(eq(customerSites.id, jobs.siteId), eq(customerSites.organizationId, s.organizationId))).innerJoin(services, and(eq(services.id, jobs.serviceId), eq(services.organizationId, s.organizationId))).leftJoin(users, and(eq(users.id, jobs.assignedUserId), eq(users.organizationId, s.organizationId))).where(and(...conditions)).orderBy(jobs.scheduledStart, jobs.createdAt, jobs.id).limit(bounded(s.limit)).offset(offset(s.offset));
  }
  async create(organizationId: string, input: Omit<typeof jobs.$inferInsert, "organizationId" | "id">) { return row((await this.db.insert(jobs).values({ ...input, organizationId }).returning())[0]); }
  async update(scope: JobScope, input: Partial<Pick<Job, "status" | "scheduledStart" | "scheduledEnd" | "assignedUserId" | "actualStart" | "actualEnd">>) { return (await this.db.update(jobs).set({ ...input, updatedAt: new Date() }).where(jobWhere(scope)).returning())[0]; }
  async overlaps(organizationId: string, assignedUserId: string, start: Date, end: Date, excludedJobId: string) {
    const results = await this.db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.organizationId, organizationId), eq(jobs.assignedUserId, assignedUserId), isNull(jobs.deletedAt), inArray(jobs.status, ["scheduled", "confirmed", "en_route", "in_progress"]), lt(jobs.scheduledStart, end), gt(jobs.scheduledEnd, start)));
    return results.some(r => r.id !== excludedJobId);
  }
}

export class JobReportRepository {
  constructor(private readonly db: Session) {}
  async get(scope: JobScope) { return (await this.db.select().from(jobReports).where(and(eq(jobReports.organizationId, scope.organizationId), eq(jobReports.jobId, scope.jobId))).limit(1))[0]; }
  async create(scope: JobScope, technicianId: string, observations?: string) { return row((await this.db.insert(jobReports).values({ ...scope, technicianId, observations }).returning())[0]); }
  async update(scope: JobScope, input: Partial<Pick<JobReport, "observations" | "infestationLevelBefore" | "infestationLevelAfter" | "treatmentPerformed" | "productsUsedSummary" | "recommendations" | "followUpRequired" | "followUpDate" | "completedAt">>) { return (await this.db.update(jobReports).set({ ...input, updatedAt: new Date() }).where(and(eq(jobReports.organizationId, scope.organizationId), eq(jobReports.jobId, scope.jobId))).returning())[0]; }
}

export interface OperationalSession {
  quotes: Pick<QuoteRepository, "get" | "search" | "create" | "update" | "items" | "addItem" | "updateItem" | "removeItem" | "countPending">;
  jobs: Pick<JobRepository, "get" | "getByQuote" | "search" | "create" | "update" | "overlaps" | "countToday">;
  reports: Pick<JobReportRepository, "get" | "create" | "update">;
  customerSite(organizationId: string, customerId: string, siteId: string): Promise<boolean>;
  service(organizationId: string, serviceId: string): Promise<boolean>;
  technician(organizationId: string, userId: string, lock?: boolean): Promise<boolean>;
  listTechnicians(organizationId: string): Promise<{ id: string; firstName: string; lastName: string }[]>;
  timezone(organizationId: string): Promise<string>;
}
export interface OperationalStoreInterface extends OperationalSession { transaction<T>(operation: (session: OperationalSession) => Promise<T>): Promise<T> }
export class RepositorySession implements OperationalSession {
  readonly quotes: QuoteRepository; readonly jobs: JobRepository; readonly reports: JobReportRepository;
  constructor(protected readonly db: Session, isTransactional = false) { this.quotes = new QuoteRepository(db, isTransactional); this.jobs = new JobRepository(db); this.reports = new JobReportRepository(db); }
  async customerSite(organizationId: string, customerId: string, siteId: string) { return (await this.db.select({ id: customerSites.id }).from(customerSites).innerJoin(customers, and(eq(customers.id, customerSites.customerId), eq(customers.organizationId, organizationId), isNull(customers.deletedAt))).where(and(eq(customerSites.id, siteId), eq(customerSites.customerId, customerId), eq(customerSites.organizationId, organizationId), isNull(customerSites.deletedAt))).limit(1)).length > 0; }
  async service(organizationId: string, serviceId: string) { return (await this.db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.organizationId, organizationId), eq(services.active, true), isNull(services.deletedAt))).limit(1)).length > 0; }
  async technician(organizationId: string, userId: string, lock = false) { const q = this.db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.role, "TECHNICIAN"), eq(users.status, "active"), isNull(users.deletedAt))).limit(1); return (await (lock ? q.for("update") : q)).length > 0; }
  async listTechnicians(organizationId: string) { return this.db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.organizationId, organizationId), eq(users.role, "TECHNICIAN"), eq(users.status, "active"), isNull(users.deletedAt))).orderBy(users.lastName).limit(100); }
  async timezone(organizationId: string) { return (await this.db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0]?.timezone ?? "Europe/Paris"; }
}
export class OperationalStore extends RepositorySession implements OperationalStoreInterface {
  constructor(private readonly database: Database) { super(database); }
  async transaction<T>(operation: (session: OperationalSession) => Promise<T>): Promise<T> { return this.database.transaction(tx => operation(new RepositorySession(tx, true))); }
}
