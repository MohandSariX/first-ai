import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { e2eFixture } from "./fixture";

test("local mobile specialist proposals require human approval and execute once",async ({page})=>{
  for(const name of ["SUPABASE_URL","DATABASE_URL"]) {if(!["localhost","127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname))throw new Error("Specialist E2E refuses non-local setup.");}
  const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const user=await admin.from("users").select("id,organization_id").eq("email",e2eFixture.email).single();if(user.error)throw user.error;
  const org=user.data.organization_id as string;
  const site=await admin.from("customer_sites").select("id,customer_id").eq("organization_id",org).limit(1).single();if(site.error)throw site.error;
  const agentId=randomUUID(),runId=randomUUID(),first=randomUUID(),second=randomUUID();
  for(const operation of [admin.from("agents").insert({id:agentId,organization_id:org,code:"pricing-e2e",name:"Pricing",version:"v1",model_profile:"LOCAL_STANDARD"}),admin.from("agent_runs").insert({id:runId,organization_id:org,agent_id:agentId,triggered_by_type:"user",triggered_by_id:user.data.id,objective:"Fictional approval boundary fixture",model_name:"mock",status:"completed",correlation_id:randomUUID()})]){const result=await operation;if(result.error)throw result.error;}
  const base={customerId:site.data.customer_id as string,siteId:site.data.id as string};
  const fingerprint=createHash("sha256").update(JSON.stringify(base)).digest("hex");
  const insert=await admin.from("approval_requests").insert([{id:first,summary:"Créer le devis fictif approuvé",notes:"Approved"},{id:second,summary:"Créer le devis fictif rejeté",notes:"Rejected"}].map(p=>({id:p.id,organization_id:org,requested_by_user_id:user.data.id,agent_run_id:runId,specialist:"pricing",action:"quotes.createDraft",payload:{...base,notes:p.notes},summary:p.summary,state_fingerprint:fingerprint,risk_level:1,expires_at:new Date(Date.now()+30*60*1000).toISOString()})));if(insert.error)throw insert.error;
  await page.setViewportSize({width:390,height:844});await page.goto("/login");await page.getByLabel("E-mail").fill(e2eFixture.email);await page.getByLabel("Mot de passe").fill(e2eFixture.password);await page.getByRole("button",{name:"Se connecter"}).click();await expect(page.getByRole("heading",{name:"Tableau de bord",exact:true})).toBeVisible({timeout:60_000});
  await page.goto("/assistant");await page.getByLabel("Assistant spécialisé").selectOption("pricing");
  const card=page.locator("article").filter({hasText:"Créer le devis fictif approuvé"});await expect(card).toBeVisible();await expect(card.getByText("pending",{exact:false})).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());await card.getByRole("button",{name:"Approuver",exact:true}).click();await expect(card.getByRole("link",{name:"Action exécutée · Ouvrir la ressource"})).toBeVisible();
  const repeat=await page.request.post("/api/assistant/proposals",{headers:{Origin:new URL(page.url()).origin},data:{proposalId:first,decision:"approve"}});expect(repeat.status()).toBe(200);const receipt=await repeat.json();expect(receipt.proposal.status).toBe("executed");
  const rejected=page.locator("article").filter({hasText:"Créer le devis fictif rejeté"});await rejected.getByRole("button",{name:"Rejeter",exact:true}).click();await expect(rejected.getByText(/· rejected$/)).toBeVisible();
  const denied=await page.request.post("/api/assistant/proposals",{headers:{Origin:new URL(page.url()).origin},data:{proposalId:second,decision:"approve"}});expect(denied.status()).toBe(409);
  const forged=await page.request.post("/api/assistant/proposals",{headers:{Origin:new URL(page.url()).origin},data:{proposalId:first,decision:"approve",organizationId:randomUUID()}});expect(forged.status()).toBe(400);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await card.getByRole("link").click();await expect(page.getByRole("heading",{name:/DEV-/})).toBeVisible();
  const created=await admin.from("quotes").select("id").eq("organization_id",org).eq("notes","Approved");expect(created.error).toBeNull();expect(created.data).toHaveLength(1);
  const notCreated=await admin.from("quotes").select("id").eq("organization_id",org).eq("notes","Rejected");expect(notCreated.data).toHaveLength(0);
  // Global local-only teardown removes proposals before runs/business fixture records.
});
