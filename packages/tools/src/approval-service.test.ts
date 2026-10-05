import { randomUUID } from "node:crypto";
import type { CurrentBusinessUser } from "@first-ai/auth";
import type { Approval, ApprovalStore, ApprovalSession, OperationalStoreInterface } from "@first-ai/database";
import { describe, expect, it, vi } from "vitest";
import { APPROVAL_ACTIONS, APPROVAL_ACTION_RISKS, ApprovalService, createProposalTools } from "./approval-service.js";
const c: CurrentBusinessUser = {userId:randomUUID(),authUserId:randomUUID(),organizationId:randomUUID(),role:"OWNER"};
function fixture() {
  const rows = new Map<string,Approval>();
  let member: CurrentBusinessUser | null = c;
  const operations = { customerSite:vi.fn(async () => true), timezone:vi.fn(async () => "Europe/Paris"),quotes:{create:vi.fn(async () => ({id:randomUUID()}))},transaction:async (fn:(s:unknown)=>Promise<unknown>) => fn(operations) } as unknown as OperationalStoreInterface;
  const session: ApprovalSession = { operations, membership:vi.fn(async () => member ? {id:member.userId,...member} : undefined), get: async (id,identity) => { const r=rows.get(id); return r?.organizationId === identity.organizationId && r.requestedByUserId === identity.userId ? r : undefined; },update:async (id,_i,changes) => { const r=rows.get(id)!; const updated={...r,...changes}; rows.set(id,updated); return updated; } };
  const store: ApprovalStore = {create:async input => { const row={...input,id:randomUUID(),status:"pending",resolvedAt:null,resolvedByUserId:null,result:null,errorCode:null,createdAt:new Date(),updatedAt:new Date()} as Approval; rows.set(row.id,row); return row; }, list:async () => [...rows.values()],transaction:async fn => fn(session)};
  let now = new Date(); const service=new ApprovalService(store,()=>now);
  return {service,rows,operations,context:{...c,agentRunId:randomUUID(),correlationId:randomUUID()},revoke:()=>{member=null;},role:(role:CurrentBusinessUser["role"])=>{member={...c,role};},expire:()=>{now=new Date(now.getTime()+31*60*1000);} };
}
const payload = {customerId:randomUUID(),siteId:randomUUID()};
describe("closed approval lifecycle without AI or a database",() => {
  it("creates only a structured proposal and executes once after explicit approval",async () => {
    const f=fixture(); const p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);
    expect(p.status).toBe("pending"); expect(f.operations.quotes.create).not.toHaveBeenCalled();
    const resolve=vi.fn(async()=>c); const executed=await f.service.decide(p.id,"approve",resolve);
    expect(executed.status).toBe("executed"); expect(resolve).toHaveBeenCalledOnce();
    expect((await f.service.decide(p.id,"approve",resolve)).result).toEqual(executed.result);
    expect(f.operations.quotes.create).toHaveBeenCalledTimes(1);
  });
  it("rejects and never executes rejected proposals",async () => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload); expect((await f.service.decide(p.id,"reject",async()=>c)).status).toBe("rejected"); await expect(f.service.decide(p.id,"approve",async()=>c)).rejects.toMatchObject({code:"CONFLICT"});expect(f.operations.quotes.create).not.toHaveBeenCalled();});
  it("expires before any write",async () => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);f.expire();expect((await f.service.decide(p.id,"approve",async()=>c)).status).toBe("expired");expect(f.operations.quotes.create).not.toHaveBeenCalled();await expect(f.service.decide(p.id,"approve",async()=>c)).rejects.toMatchObject({code:"CONFLICT"});});
  it("rechecks membership even if the resolver returns an old context",async () => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);f.revoke();await expect(f.service.decide(p.id,"approve",async()=>c)).rejects.toMatchObject({code:"FORBIDDEN"});expect(f.operations.quotes.create).not.toHaveBeenCalled();});
  it.each(["READ_ONLY","ACCOUNTANT","TECHNICIAN"] as const)("rechecks a changed %s role at execution",async role => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);f.role(role);await expect(f.service.decide(p.id,"approve",async()=>c)).rejects.toMatchObject({code:"FORBIDDEN"});expect(f.operations.quotes.create).not.toHaveBeenCalled();});
  it("blocks known proposal UUIDs from another tenant",async () => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);await expect(f.service.decide(p.id,"approve",async()=>({...c,organizationId:randomUUID()}))).rejects.toMatchObject({code:"NOT_FOUND"});});
  it("revalidates payload and current service invariants",async () => {const f=fixture(),p=await f.service.createProposal(f.context,"pricing","quotes.createDraft",payload);f.rows.set(p.id,{...p,payload:{...payload,organizationId:randomUUID()}});expect((await f.service.decide(p.id,"approve",async()=>c)).status).toBe("failed");expect(f.operations.quotes.create).not.toHaveBeenCalled();});
  it("never dispatches arbitrary actions or quote acceptance",async () => {const f=fixture(); for(const name of ["quotes.accept","executeSql","__proto__"]) await expect(f.service.createProposal(f.context,"pricing",name,payload)).rejects.toMatchObject({code:"VALIDATION_ERROR"});expect(Object.keys(APPROVAL_ACTIONS)).not.toContain("quotes.accept");});
  it("each specialist has proposal-only writes with strict input and no execution tool",() => {const f=fixture();for(const specialist of ["pricing","planning","technician"] as const){const tools=createProposalTools(f.service,specialist);expect(Object.values(tools).every(t=>t.name.startsWith("proposals.") && t.risk===1)).toBe(true);expect(Object.keys(tools).some(n=>/approve|accept|execute/.test(n))).toBe(false);}});
  it("retains the documented Risk 2 classification of scheduling and finalization",()=>{expect(APPROVAL_ACTION_RISKS["jobs.schedule"]).toBe(2);expect(APPROVAL_ACTION_RISKS["jobs.complete"]).toBe(2);expect(APPROVAL_ACTION_RISKS["reports.complete"]).toBe(2);expect(Object.keys(APPROVAL_ACTION_RISKS)).toEqual(Object.keys(APPROVAL_ACTIONS));});
});
