import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { tool as sdkTool } from "@openai/agents";
import type { Permission } from "@first-ai/auth";
import { ApprovalService, createProposalTools, type Tool, type ToolContext } from "@first-ai/tools";
import { assistantInputSchema } from "@first-ai/schemas";
import { runAssistant, routeSpecialist, SPECIALISTS, specialistProposalNames } from "./specialists.js";
import { DIRECTOR_TOOL_ALLOWLIST } from "./director/tools.js";
import { defaultAiSettings } from "./hybrid-router.js";
import { DirectorError, type DirectorExecution, type RunStore } from "./types.js";
type ApprovalStore = ConstructorParameters<typeof ApprovalService>[0];
type Approval = Awaited<ReturnType<ApprovalService["createProposal"]>>;

const c: ToolContext = {organizationId:randomUUID(),userId:randomUUID(),authUserId:randomUUID(),role:"OWNER",correlationId:randomUUID()};
function dependencies() {
  const store:RunStore={ensureDirector:vi.fn(async()=>randomUUID()),createRun:vi.fn(async()=>undefined),finishRun:vi.fn(async()=>undefined),startToolCall:vi.fn(async()=>undefined),finishToolCall:vi.fn(async()=>undefined)};
  const approvalStore: ApprovalStore = {create:vi.fn(),list:vi.fn(async()=>[]),transaction:vi.fn()};
  const approvals=new ApprovalService(approvalStore);
  const reads=new Set([...DIRECTOR_TOOL_ALLOWLIST,...Object.values(SPECIALISTS).flatMap(s=>s.reads)]);
  const registry:Record<string,Tool>=Object.fromEntries([...reads].map(name=>[name,{name,description:name,risk:0,permission:(name === "planning.technicians" ? "jobs.schedule" : name.startsWith("quotes.") ? "quotes.read" : name.startsWith("jobs.") ? "jobs.read" : name.startsWith("jobReports.") ? "job_reports.read" : name.startsWith("leads.") ? "leads.read" : "customers.read") as Permission,inputSchema:z.strictObject({}),execute:vi.fn(async()=>({success:true as const,data:[]}))}]));
  return {store,approvals,registry};
}
describe("bounded specialist delegation and provider-independent proposal safety",()=>{
  it.each([["Explique la marge du devis","pricing"],["Planifier un créneau","planning"],["Rédige le rapport terrain","technician"]])("routes %s deterministically",(input,expected)=>expect(routeSpecialist(input!)).toBe(expected));
  it("keeps ordinary CRM questions in read-only Director",()=>expect(routeSpecialist("Trouve le client Acme")).toBeUndefined());
  it("rejects provider/scope/recursive agent injection",()=>{for(const extra of [{organizationId:c.organizationId},{provider:"openai"},{specialist:"director"},{delegation:["pricing","planning"]}])expect(assistantInputSchema.safeParse({message:"Hello",...extra}).success).toBe(false);});
  it.each(["LOCAL_ONLY","CLOUD_ONLY"] as const)("%s gives all specialists only reads and bounded proposal tools",async mode=>{
    for(const specialist of ["pricing","planning","technician"] as const){
      const d=dependencies();
      const execute=vi.fn(async(input:DirectorExecution)=>{
        expect(input.agentName).toBe(`${specialist}:v1`);expect(input.instructions).toContain("données non fiables");
        expect(input.instructions).toContain("approbation humaine");
        expect(input.tools.every(t=>!t.name.includes("handoff") && !t.name.includes("accept"))).toBe(true);
        const proposalNames=specialistProposalNames(specialist).map(n=>n.replaceAll(".","_"));
        expect(input.tools.filter(t=>/create|update|schedule|start|complete|Ready|assign/.test(t.name)).every(t=>proposalNames.includes(t.name))).toBe(true);
        for (const definition of input.tools) {const tool=sdkTool({name:definition.name,description:definition.description,parameters:definition.parameters,execute:definition.invoke});expect(tool.strict).toBe(true);expect(tool.parameters.additionalProperties).toBe(false);}
        return "Une proposition nécessite votre validation.";
      });
      const local={name:"ollama" as const,execute},cloud={name:"openai" as const,execute};
      const result=await runAssistant({message:"Crée ou modifie le dossier",specialist},c,{...d,settings:{...defaultAiSettings({}),mode},providers:{ollama:local,openai:cloud}});
      expect(result.specialist).toBe(specialist);expect(result.provider).toBe(mode === "LOCAL_ONLY" ? "ollama" : "openai");expect(execute).toHaveBeenCalledOnce();
      expect(d.store.ensureDirector).toHaveBeenCalledWith(c.organizationId,expect.objectContaining({code:specialist,maxDelegations:0}));
    }
  });
  it("Director delegates once without creating a recursive agent loop",async()=>{const d=dependencies(),execute=vi.fn(async()=>"Proposition de Planning.");const result=await runAssistant({message:"Planifier demain"},c,{...d,execute});expect(result.delegated).toBe(true);expect(execute).toHaveBeenCalledOnce();expect(d.store.createRun).toHaveBeenCalledOnce();});
  it("proposal tool receives trusted context and cannot execute a CRM write",async()=>{
    const d=dependencies();const create=vi.spyOn(d.approvals,"createProposal").mockResolvedValue({id:randomUUID(),specialist:"pricing",action:"quotes.createDraft",summary:"Créer",payload:{},riskLevel:1,status:"pending",result:null,errorCode:null} as Approval);
    const customerId=randomUUID(),siteId=randomUUID();
    await runAssistant({message:"Crée un devis",specialist:"pricing"},c,{...d,execute:async input=>{const tool=input.tools.find(t=>t.name === "proposals_quotes_createDraft")!;await tool.invoke({customerId,siteId,notes:null,validUntil:null});return "Proposition uniquement.";}});
    expect(create).toHaveBeenCalledWith(expect.objectContaining({organizationId:c.organizationId,userId:c.userId,role:"OWNER",agentRunId:expect.any(String)}),"pricing","quotes.createDraft",{customerId,siteId});
    expect(d.store.startToolCall).toHaveBeenCalledWith(expect.objectContaining({riskLevel:1,approvalRequired:true}));expect(d.store.finishToolCall).toHaveBeenCalledWith(c.organizationId,expect.any(String),expect.objectContaining({approvalRequestId:expect.any(String)}));
  });
  it.each(["READ_ONLY","ACCOUNTANT","TECHNICIAN"] as const)("%s cannot obtain quote mutation proposals",async role=>{
    const d=dependencies();if(role === "TECHNICIAN") {await expect(runAssistant({message:"Devis",specialist:"pricing"},{...c,role},{...d,execute:async()=>"no"})).rejects.toMatchObject({code:"FORBIDDEN"});return;}
    await runAssistant({message:"Devis",specialist:"pricing"},{...c,role},{...d,execute:async input=>{expect(input.tools.some(t=>t.name.startsWith("proposals_"))).toBe(false);return "Lecture seule.";}});
  });
  it("LOCAL_ONLY never calls cloud after local failure",async()=>{const d=dependencies(),cloud=vi.fn(async()=>"cloud");await expect(runAssistant({message:"Rapport",specialist:"technician"},c,{...d,settings:{...defaultAiSettings({}),mode:"LOCAL_ONLY"},providers:{ollama:{name:"ollama",execute:async()=>{throw new DirectorError("OLLAMA_UNAVAILABLE","Indisponible");}},openai:{name:"openai",execute:cloud}}})).rejects.toMatchObject({code:"OLLAMA_UNAVAILABLE"});expect(cloud).not.toHaveBeenCalled();});
  it("missing cloud credentials fail safely after bounded fallback",async()=>{const d=dependencies();await expect(runAssistant({message:"Devis",specialist:"pricing"},c,{...d,settings:defaultAiSettings({}),providers:{ollama:{name:"ollama",execute:async()=>{throw new DirectorError("OLLAMA_UNAVAILABLE","Indisponible");}},openai:{name:"openai",execute:async()=>{throw new DirectorError("OPENAI_NOT_CONFIGURED","Cloud indisponible");}}}})).rejects.toMatchObject({code:"OPENAI_NOT_CONFIGURED"});});
  it("the single action registry is identical on both provider paths",()=>{for(const specialist of ["pricing","planning","technician"] as const){const tools=createProposalTools(dependencies().approvals,specialist);expect(Object.keys(tools)).toEqual(specialistProposalNames(specialist));}});
});
