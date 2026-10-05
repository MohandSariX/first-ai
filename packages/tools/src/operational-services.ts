import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { Job, OperationalSession, OperationalStoreInterface, Quote } from "@first-ai/database";
import { acceptQuoteSchema, addQuoteItemSchema, assignTechnicianSchema, createDraftJobSchema, createDraftQuoteSchema, createJobReportSchema, followUpRecommendationSchema, rescheduleJobSchema, scheduleJobSchema, searchJobsSchema, searchQuotesSchema, updateDraftQuoteSchema, updateJobReportSchema, updateQuoteItemSchema } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { calculateQuoteTotals, subtractMoney } from "./quote-calculation.js";
import { assertJobTransition, assertQuoteTransition, localCalendarDate, OperationalConflictError, organizationDay } from "./operational-policies.js";

function authorize(c: CurrentBusinessUser, p: Permission) { if (!hasPermission(c.role, p)) throw new AuthorizationError("Action non autorisée."); }
function found<T>(v: T | undefined): T { if (v === undefined) throw new ResourceNotFoundError("Ressource introuvable."); return v; }
const quoteScope = (c: CurrentBusinessUser, id: string) => ({ organizationId: c.organizationId, quoteId: z.uuid().parse(id) });
const jobScope = (c: CurrentBusinessUser, id: string) => ({ organizationId: c.organizationId, jobId: z.uuid().parse(id) });
function assigned(c: CurrentBusinessUser, job: Job) { if (c.role === "TECHNICIAN" && job.assignedUserId !== c.userId) throw new ResourceNotFoundError("Ressource introuvable."); }
function draft(q: Quote) { if (q.status !== "draft") throw new OperationalConflictError("Seul un brouillon peut être modifié."); }
async function customerSite(s: OperationalSession, c: CurrentBusinessUser, customerId: string, siteId: string) { if (!await s.customerSite(c.organizationId, customerId, siteId)) throw new ResourceNotFoundError("Client ou site introuvable."); }
async function service(s: OperationalSession, organizationId: string, serviceId: string | null | undefined) { if (serviceId && !await s.service(organizationId, serviceId)) throw new ResourceNotFoundError("Prestation active introuvable."); }
async function persistTotals(s: OperationalSession, scope: ReturnType<typeof quoteScope>) { const totals = calculateQuoteTotals(await s.quotes.items(scope)); return found(await s.quotes.update(scope, totals)); }

export class QuoteService {
  constructor(private readonly store: OperationalStoreInterface) {}
  async getQuote(c: CurrentBusinessUser, id: string) { authorize(c, "quotes.read"); const scope = quoteScope(c, id); return { ...found(await this.store.quotes.get(scope)), items: await this.store.quotes.items(scope) }; }
  async searchQuotes(c: CurrentBusinessUser, input: unknown) { authorize(c, "quotes.read"); return this.store.quotes.search({ organizationId: c.organizationId, ...searchQuotesSchema.parse(input) }); }
  async countPending(c: CurrentBusinessUser) { authorize(c, "quotes.read"); return this.store.quotes.countPending(c.organizationId); }
  async createDraftQuote(c: CurrentBusinessUser, input: unknown) {
    authorize(c, "quotes.write"); const parsed = createDraftQuoteSchema.parse(input);
    return this.store.transaction(async s => { await customerSite(s, c, parsed.customerId, parsed.siteId); const timezone = await s.timezone(c.organizationId); const year = Number(localCalendarDate(timezone).slice(0, 4)); return s.quotes.create(c.organizationId, c.userId, parsed, year); });
  }
  async updateDraftQuote(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "quotes.write"); const parsed = updateDraftQuoteSchema.parse(input); const scope = quoteScope(c, id); return this.store.transaction(async s => { draft(found(await s.quotes.get(scope, true))); return found(await s.quotes.update(scope, parsed)); }); }
  async addQuoteItem(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "quotes.write"); const parsed = addQuoteItemSchema.parse(input); const scope = quoteScope(c, id); return this.store.transaction(async s => { draft(found(await s.quotes.get(scope, true))); if ((await s.quotes.items(scope)).length >= 200) throw new OperationalConflictError("Maximum 200 lignes par devis."); await service(s, c.organizationId, parsed.serviceId); const item = await s.quotes.addItem(scope, parsed); await persistTotals(s, scope); return item; }); }
  async updateQuoteItem(c: CurrentBusinessUser, id: string, itemId: string, input: unknown) { authorize(c, "quotes.write"); const parsed = updateQuoteItemSchema.parse(input); const scope = quoteScope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.quotes.get(scope, true))); await service(s, c.organizationId, parsed.serviceId); const item = found(await s.quotes.updateItem(scope, itemId, parsed)); await persistTotals(s, scope); return item; }); }
  async removeQuoteItem(c: CurrentBusinessUser, id: string, itemId: string) { authorize(c, "quotes.write"); const scope = quoteScope(c, id); z.uuid().parse(itemId); return this.store.transaction(async s => { draft(found(await s.quotes.get(scope, true))); const item = found(await s.quotes.removeItem(scope, itemId)); await persistTotals(s, scope); return item; }); }
  // Pure read calculation for Risk 0 tools; all item mutations persist the same totals atomically.
  async calculateQuote(c: CurrentBusinessUser, id: string) { const q = await this.getQuote(c, id); return calculateQuoteTotals(q.items); }
  async markQuoteReady(c: CurrentBusinessUser, id: string) { authorize(c, "quotes.write"); const scope = quoteScope(c, id); return this.store.transaction(async s => { const q = found(await s.quotes.get(scope, true)); assertQuoteTransition(q.status, "ready"); const items = await s.quotes.items(scope); if (!items.length) throw new OperationalConflictError("Ajoutez au moins une ligne."); await customerSite(s, c, q.customerId, q.siteId); if (q.validUntil && q.validUntil < localCalendarDate(await s.timezone(c.organizationId))) throw new OperationalConflictError("Le devis a expiré."); await persistTotals(s, scope); return found(await s.quotes.update(scope, { status: "ready" })); }); }
  async acceptQuoteAndCreateJob(c: CurrentBusinessUser, id: string, input: unknown) {
    authorize(c, "quotes.accept"); authorize(c, "jobs.write"); const parsed = acceptQuoteSchema.parse(input); const scope = quoteScope(c, id);
    return this.store.transaction(async s => {
      const q = found(await s.quotes.get(scope, true));
      if (q.status === "accepted") { const existing = found(await s.jobs.getByQuote(scope)); if (existing.serviceId !== parsed.serviceId) throw new OperationalConflictError("Ce devis a déjà été accepté avec une autre prestation."); return { quote: q, job: existing }; }
      assertQuoteTransition(q.status, "accepted");
      if (q.validUntil && q.validUntil < localCalendarDate(await s.timezone(c.organizationId))) throw new OperationalConflictError("Le devis a expiré.");
      await customerSite(s, c, q.customerId, q.siteId); await service(s, c.organizationId, parsed.serviceId);
      const items = await s.quotes.items(scope); if (!items.some(v => v.serviceId === parsed.serviceId)) throw new OperationalConflictError("Choisissez une prestation présente dans le devis.");
      const totals = calculateQuoteTotals(items);
      const accepted = found(await s.quotes.update(scope, { ...totals, status: "accepted", acceptedAt: new Date() }));
      const job = await s.jobs.create(c.organizationId, { customerId: q.customerId, siteId: q.siteId, quoteId: q.id, serviceId: parsed.serviceId, price: totals.subtotal, estimatedCost: totals.estimatedCost, estimatedMargin: totals.estimatedMargin, description: `Intervention issue du devis ${q.quoteNumber}`, createdByUserId: c.userId });
      return { quote: accepted, job };
    });
  }
  async rejectQuote(c: CurrentBusinessUser, id: string) { authorize(c, "quotes.accept"); const scope = quoteScope(c, id); return this.store.transaction(async s => { assertQuoteTransition(found(await s.quotes.get(scope, true)).status, "rejected"); return found(await s.quotes.update(scope, { status: "rejected", rejectedAt: new Date() })); }); }
}

export class JobService {
  constructor(private readonly store: OperationalStoreInterface) {}
  async getTimezone(c: CurrentBusinessUser) { authorize(c, "jobs.read"); return this.store.timezone(c.organizationId); }
  async getJob(c: CurrentBusinessUser, id: string) { authorize(c, "jobs.read"); const job = found(await this.store.jobs.get(jobScope(c, id))); assigned(c, job); return job; }
  async searchJobs(c: CurrentBusinessUser, input: unknown) { authorize(c, "jobs.read"); const { date, ...parsed } = searchJobsSchema.parse(input); const range = date ? organizationDay(date, await this.store.timezone(c.organizationId)) : {}; return this.store.jobs.search({ ...parsed, ...range, organizationId: c.organizationId, ...(c.role === "TECHNICIAN" ? { assignedUserId: c.userId } : {}) }); }
  async getToday(c: CurrentBusinessUser, input: unknown = {}) { authorize(c, "jobs.read"); const timezone = await this.store.timezone(c.organizationId); const date = localCalendarDate(timezone); return { date, timezone, jobs: await this.searchJobs(c, { ...searchJobsSchema.parse(input), date }) }; }
  async createDraftJob(c: CurrentBusinessUser, input: unknown) { authorize(c, "jobs.write"); const parsed = createDraftJobSchema.parse(input); return this.store.transaction(async s => { await customerSite(s, c, parsed.customerId, parsed.siteId); await service(s, c.organizationId, parsed.serviceId); return s.jobs.create(c.organizationId, { ...parsed, createdByUserId: c.userId, estimatedMargin: subtractMoney(parsed.price, parsed.estimatedCost) }); }); }
  async listTechnicians(c: CurrentBusinessUser) { authorize(c, "jobs.schedule"); return this.store.listTechnicians(c.organizationId); }
  async countToday(c: CurrentBusinessUser) { authorize(c, "jobs.read"); const timezone = await this.store.timezone(c.organizationId); return this.store.jobs.countToday({ organizationId: c.organizationId, ...organizationDay(localCalendarDate(timezone), timezone), ...(c.role === "TECHNICIAN" ? { assignedUserId: c.userId } : {}) }); }
  async scheduleJob(c: CurrentBusinessUser, id: string, input: unknown) { return this.schedule(c, id, scheduleJobSchema.parse(input), false); }
  async rescheduleJob(c: CurrentBusinessUser, id: string, input: unknown) { return this.schedule(c, id, rescheduleJobSchema.parse(input), true); }
  private async schedule(c: CurrentBusinessUser, id: string, input: { scheduledStart: string; scheduledEnd: string }, reschedule: boolean) {
    authorize(c, "jobs.schedule"); const scope = jobScope(c, id);
    return this.store.transaction(async s => {
      const job = found(await s.jobs.get(scope, true));
      if (reschedule) { if (!["scheduled", "confirmed"].includes(job.status)) throw new OperationalConflictError("Cette intervention ne peut pas être replanifiée."); } else assertJobTransition(job.status, "scheduled");
      const start = new Date(input.scheduledStart), end = new Date(input.scheduledEnd);
      if (job.assignedUserId) { if (!await s.technician(c.organizationId, job.assignedUserId, true)) throw new ResourceNotFoundError("Technicien actif introuvable."); if (await s.jobs.overlaps(c.organizationId, job.assignedUserId, start, end, job.id)) throw new OperationalConflictError("Ce technicien a déjà une intervention sur ce créneau."); }
      return found(await s.jobs.update(scope, { status: "scheduled", scheduledStart: start, scheduledEnd: end }));
    });
  }
  async assignTechnician(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "jobs.schedule"); const parsed = assignTechnicianSchema.parse(input); const scope = jobScope(c, id); return this.store.transaction(async s => { const job = found(await s.jobs.get(scope, true)); if (!["draft", "scheduled", "confirmed"].includes(job.status)) throw new OperationalConflictError("L’affectation ne peut plus être modifiée."); if (parsed.assignedUserId) { if (!await s.technician(c.organizationId, parsed.assignedUserId, true)) throw new ResourceNotFoundError("Technicien actif introuvable."); if (job.scheduledStart && job.scheduledEnd && await s.jobs.overlaps(c.organizationId, parsed.assignedUserId, job.scheduledStart, job.scheduledEnd, id)) throw new OperationalConflictError("Créneau déjà occupé."); } return found(await s.jobs.update(scope, parsed)); }); }
  async startJob(c: CurrentBusinessUser, id: string) { authorize(c, "jobs.execute"); const scope = jobScope(c, id); return this.store.transaction(async s => { const job = found(await s.jobs.get(scope, true)); assigned(c, job); assertJobTransition(job.status, "in_progress"); return found(await s.jobs.update(scope, { status: "in_progress", actualStart: new Date() })); }); }
  async completeJob(c: CurrentBusinessUser, id: string) { authorize(c, "jobs.execute"); const scope = jobScope(c, id); return this.store.transaction(async s => { const job = found(await s.jobs.get(scope, true)); assigned(c, job); const report = found(await s.reports.get(scope)); if (!report.completedAt) throw new OperationalConflictError("Finalisez le rapport avant de terminer l’intervention."); const status = report.followUpRequired ? "follow_up_required" : "completed"; assertJobTransition(job.status, status); return found(await s.jobs.update(scope, { status, actualEnd: new Date() })); }); }
  async cancelJob(c: CurrentBusinessUser, id: string) { authorize(c, "jobs.write"); const scope = jobScope(c, id); return this.store.transaction(async s => { assertJobTransition(found(await s.jobs.get(scope, true)).status, "cancelled"); return found(await s.jobs.update(scope, { status: "cancelled" })); }); }
}

export class JobReportService {
  constructor(private readonly store: OperationalStoreInterface) {}
  private async accessible(s: OperationalSession, c: CurrentBusinessUser, id: string, write = false) { const scope = jobScope(c, id); const job = found(await s.jobs.get(scope, write)); assigned(c, job); if (write && job.status !== "in_progress") throw new OperationalConflictError("Démarrez l’intervention avant de rédiger le rapport."); const report = await s.reports.get(scope); if (write && c.role === "TECHNICIAN" && report && report.technicianId !== c.userId) throw new AuthorizationError("Seul l’auteur peut modifier ce rapport."); if (write && report?.completedAt) throw new OperationalConflictError("Le rapport est déjà finalisé."); return { scope, job, report }; }
  async getJobReport(c: CurrentBusinessUser, id: string) { authorize(c, "job_reports.read"); return found((await this.accessible(this.store, c, id)).report); }
  async createJobReportDraft(c: CurrentBusinessUser, input: unknown) { authorize(c, "job_reports.write"); const parsed = createJobReportSchema.parse(input); return this.store.transaction(async s => { const { scope, report } = await this.accessible(s, c, parsed.jobId, true); if (report) return report; return s.reports.create(scope, c.userId, parsed.observations); }); }
  async updateJobReport(c: CurrentBusinessUser, id: string, input: unknown) { authorize(c, "job_reports.write"); const parsed = updateJobReportSchema.parse(input); return this.store.transaction(async s => { const { scope, report } = await this.accessible(s, c, id, true); found(report); const merged = { ...report, ...parsed }; if (merged.followUpDate && !merged.followUpRequired) throw new OperationalConflictError("Activez le suivi avant de choisir une date."); return found(await s.reports.update(scope, parsed)); }); }
  async completeJobReport(c: CurrentBusinessUser, id: string) { authorize(c, "job_reports.write"); return this.store.transaction(async s => { const { scope, report } = await this.accessible(s, c, id, true); const r = found(report); if (!r.observations?.trim() || !r.treatmentPerformed?.trim()) throw new OperationalConflictError("Renseignez les observations et le traitement réalisé."); return found(await s.reports.update(scope, { completedAt: new Date() })); }); }
  async scheduleFollowUpRecommendation(c: CurrentBusinessUser, id: string, input: unknown) { const parsed = followUpRecommendationSchema.parse(input); return this.updateJobReport(c, id, { followUpRequired: true, ...parsed }); }
}
