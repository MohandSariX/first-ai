import { createHash } from "node:crypto";
import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { Approval, ApprovalStore, OperationalStoreInterface } from "@first-ai/database";
import { proposalPayloadSchemas, type ProposalAction, type Specialist, specialistSchema } from "@first-ai/schemas";
import { QuoteService, JobService, JobReportService } from "./operational-services.js";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";
import type { ToolContext, Tool } from "./crm-tools.js";
export class ApprovalError extends Error { constructor(readonly code:string,message:string) { super(message); } }
function errorCode(e:unknown) { return e instanceof ApprovalError || e instanceof AuthorizationError || e instanceof ResourceNotFoundError || e instanceof OperationalConflictError ? e.code : "EXECUTION_FAILED"; }

type Action = { specialist: Specialist; permission: Permission; summary: string; execute: (s: OperationalStoreInterface, c: CurrentBusinessUser, p: Record<string, unknown>) => Promise<{ resourceId: string; href: string }> };
// Risk of the proposed business action, not the lower-impact proposal-record tool.
// Planning/finalization are Risk 2 in TOOLS.md; both require explicit approval.
export const APPROVAL_ACTION_RISKS: Readonly<Record<ProposalAction,1|2>> = Object.freeze({
  "quotes.createDraft":1,"quotes.addItem":1,"quotes.updateItem":1,"quotes.markReady":1,
  "jobs.schedule":2,"jobs.reschedule":2,"jobs.assignTechnician":2,"jobs.start":1,
  "reports.createDraft":1,"reports.update":1,"reports.complete":2,"jobs.complete":2,
});
const quoteResult = (id: string) => ({ resourceId: id, href: `/quotes/${id}` });
const jobResult = (id: string) => ({ resourceId: id, href: `/jobs/${id}` });
// This is the only execution registry. No code, tool names or URLs supplied by AI
// are dispatched. Payloads are parsed again immediately before service execution.
export const APPROVAL_ACTIONS: Readonly<Record<ProposalAction, Action>> = Object.freeze({
  "quotes.createDraft": { specialist: "pricing", permission: "quotes.write", summary: "Créer un devis brouillon", execute: async (s,c,p) => quoteResult((await new QuoteService(s).createDraftQuote(c,p)).id) },
  "quotes.addItem": { specialist: "pricing", permission: "quotes.write", summary: "Ajouter une ligne au devis", execute: async (s,c,{quoteId,...p}) => { await new QuoteService(s).addQuoteItem(c,String(quoteId),p); return quoteResult(String(quoteId)); } },
  "quotes.updateItem": { specialist: "pricing", permission: "quotes.write", summary: "Modifier une ligne du devis", execute: async (s,c,{quoteId,itemId,...p}) => { await new QuoteService(s).updateQuoteItem(c,String(quoteId),String(itemId),p); return quoteResult(String(quoteId)); } },
  "quotes.markReady": { specialist: "pricing", permission: "quotes.write", summary: "Marquer le devis prêt", execute: async (s,c,p) => quoteResult((await new QuoteService(s).markQuoteReady(c,String(p.quoteId))).id) },
  "jobs.schedule": { specialist: "planning", permission: "jobs.schedule", summary: "Planifier une intervention", execute: async (s,c,{jobId,...p}) => jobResult((await new JobService(s).scheduleJob(c,String(jobId),p)).id) },
  "jobs.reschedule": { specialist: "planning", permission: "jobs.schedule", summary: "Replanifier une intervention", execute: async (s,c,{jobId,...p}) => jobResult((await new JobService(s).rescheduleJob(c,String(jobId),p)).id) },
  "jobs.assignTechnician": { specialist: "planning", permission: "jobs.schedule", summary: "Affecter un technicien", execute: async (s,c,{jobId,...p}) => jobResult((await new JobService(s).assignTechnician(c,String(jobId),p)).id) },
  "jobs.start": { specialist: "technician", permission: "jobs.execute", summary: "Démarrer l’intervention", execute: async (s,c,p) => jobResult((await new JobService(s).startJob(c,String(p.jobId))).id) },
  "reports.createDraft": { specialist: "technician", permission: "job_reports.write", summary: "Créer un rapport brouillon", execute: async (s,c,p) => { await new JobReportService(s).createJobReportDraft(c,p); return jobResult(String(p.jobId)); } },
  "reports.update": { specialist: "technician", permission: "job_reports.write", summary: "Modifier le rapport", execute: async (s,c,{jobId,...p}) => { await new JobReportService(s).updateJobReport(c,String(jobId),p); return jobResult(String(jobId)); } },
  "reports.complete": { specialist: "technician", permission: "job_reports.write", summary: "Finaliser le rapport", execute: async (s,c,p) => { await new JobReportService(s).completeJobReport(c,String(p.jobId)); return jobResult(String(p.jobId)); } },
  "jobs.complete": { specialist: "technician", permission: "jobs.execute", summary: "Terminer l’intervention", execute: async (s,c,p) => jobResult((await new JobService(s).completeJob(c,String(p.jobId))).id) },
});
function action(name: string) {
  if (!Object.hasOwn(APPROVAL_ACTIONS,name)) throw new ApprovalError("VALIDATION_ERROR","Action non autorisée.");
  return { name: name as ProposalAction, definition: APPROVAL_ACTIONS[name as ProposalAction] };
}
function authorize(c: CurrentBusinessUser, permission: Permission) { if (!hasPermission(c.role,permission)) throw new ApprovalError("FORBIDDEN","Action non autorisée."); }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function fingerprint(s: OperationalStoreInterface,c: CurrentBusinessUser,name: ProposalAction,p: Record<string,unknown>) {
  if (name === "quotes.createDraft") {
    if (!await s.customerSite(c.organizationId,String(p.customerId),String(p.siteId))) throw new ApprovalError("NOT_FOUND","Client ou site introuvable.");
    return hash({ customerId:p.customerId,siteId:p.siteId });
  }
  if (name.startsWith("quotes.")) {
    const scope = { organizationId:c.organizationId,quoteId:String(p.quoteId) };
    const quote = await s.quotes.get(scope,true);
    if (!quote) throw new ApprovalError("NOT_FOUND","Devis introuvable.");
    await new QuoteService(s).getQuote(c,quote.id);
    const items = await s.quotes.items(scope);
    if (p.itemId && !items.some(i => i.id === p.itemId)) throw new ApprovalError("NOT_FOUND","Ligne introuvable.");
    return hash({ quote,items });
  }
  const scope = { organizationId:c.organizationId,jobId:String(p.jobId) };
  const job = await s.jobs.get(scope,true);
  if (!job) throw new ApprovalError("NOT_FOUND","Intervention introuvable.");
  await new JobService(s).getJob(c,job.id); // Includes technician assignment restrictions.
  const report = await s.reports.get(scope);
  if (name.startsWith("reports.") && (name !== "reports.createDraft" || report)) await new JobReportService(s).getJobReport(c,job.id);
  return hash({ job,report:report ?? null });
}
export class ApprovalService {
  constructor(private readonly store: ApprovalStore, private readonly now = () => new Date()) {}
  async createProposal(context: ToolContext, specialist: Specialist, name: string, input: unknown) {
    const {name:key,definition} = action(name);
    if (specialist !== definition.specialist || !context.agentRunId) throw new ApprovalError("FORBIDDEN","Proposition non autorisée.");
    const payload = proposalPayloadSchemas[key].parse(input);
    const stateFingerprint = await this.store.transaction(async s => {
      const member = await s.membership(context);
      if (!member) throw new ApprovalError("FORBIDDEN","Une adhésion active est nécessaire.");
      const current = {...context,role:member.role};
      authorize(current,definition.permission);
      return fingerprint(s.operations,current,key,payload);
    });
    return this.store.create({ organizationId:context.organizationId,requestedByUserId:context.userId,agentRunId:context.agentRunId,specialist,action:key,payload,summary:definition.summary,stateFingerprint,riskLevel:APPROVAL_ACTION_RISKS[key],expiresAt:new Date(this.now().getTime()+30*60*1000) });
  }
  async decide(id: string, decision: "approve" | "reject", resolveCurrentUser: () => Promise<CurrentBusinessUser>) {
    // The caller supplies a server auth resolver, never a cached browser context.
    const identity = await resolveCurrentUser();
    return this.store.transaction(async s => {
      const member = await s.membership(identity);
      if (!member) throw new ApprovalError("FORBIDDEN","Une adhésion active est nécessaire.");
      const current: CurrentBusinessUser = {...identity,role:member.role};
      const proposal = await s.get(id,current);
      if (!proposal) throw new ApprovalError("NOT_FOUND","Proposition introuvable.");
      const {name,definition} = action(proposal.action);
      authorize(current,definition.permission);
      if (proposal.status === "executed") return proposal; // Idempotent receipt, not another execution.
      if (proposal.status !== "pending") throw new ApprovalError("CONFLICT","Cette proposition ne peut plus être exécutée.");
      const resolved = {resolvedAt:this.now(),resolvedByUserId:current.userId};
      if (proposal.expiresAt <= this.now()) return s.update(id,current,{...resolved,status:"expired"});
      if (decision === "reject") return s.update(id,current,{...resolved,status:"rejected"});
      try {
        if (proposal.specialist !== definition.specialist || proposal.riskLevel !== APPROVAL_ACTION_RISKS[name]) throw new ApprovalError("VALIDATION_ERROR","Proposition invalide.");
        const payload = proposalPayloadSchemas[name].parse(proposal.payload);
        if (await fingerprint(s.operations,current,name,payload) !== proposal.stateFingerprint) throw new ApprovalError("STALE_PROPOSAL","Les données ont changé. Demandez une nouvelle proposition.");
        await s.update(id,current,{...resolved,status:"approved"});
        const result = await definition.execute(s.operations,current,payload);
        return s.update(id,current,{status:"executed",result,errorCode:null});
      } catch (error: unknown) {
        return s.update(id,current,{...resolved,status:"failed",errorCode:errorCode(error)});
      }
    });
  }
  async list(context: CurrentBusinessUser) { return (await this.store.list(context)).map(proposalView); }
}
export function proposalView(p: Approval) { return {id:p.id,specialist:specialistSchema.parse(p.specialist),action:p.action,summary:p.summary,payload:p.payload,riskLevel:p.riskLevel,status:p.status,result:p.result,errorCode:p.errorCode}; }
export function createProposalTools(service: ApprovalService, specialist: Specialist): Readonly<Record<string,Tool>> {
  return Object.fromEntries(Object.entries(APPROVAL_ACTIONS).filter(([,a]) => a.specialist === specialist).map(([name,a]) => {
    const tool: Tool = {name:`proposals.${name}`,description:`Propose uniquement : ${a.summary}. Ne modifie pas le métier. Validation humaine obligatoire.`,risk:1,permission:a.permission,inputSchema:proposalPayloadSchemas[name as ProposalAction],
      async execute(c,p) { try { return {success:true,data:proposalView(await service.createProposal(c,specialist,name,p))}; } catch (e:unknown) { return {success:false,error:{code:e instanceof ApprovalError ? e.code : "VALIDATION_ERROR",message:"Proposition impossible. Vérifiez vos droits et les données."}}; } } };
    return [tool.name,tool];
  }));
}
