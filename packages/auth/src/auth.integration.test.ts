import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminSupabaseClient } from "./admin.js";
import { resolveCurrentBusinessUser } from "./current-user.js";
import { hasPermission } from "./permissions.js";

const organizationAId = randomUUID();
const organizationBId = randomUUID();
const businessUserAId = randomUUID();
const businessUserBId = randomUUID();
const customerAId = randomUUID();
const customerBId = randomUUID();
const contactAId = randomUUID();
const contactBId = randomUUID();
const customerSiteAId = randomUUID();
const customerSiteBId = randomUUID();
const leadAId = randomUUID();
const leadBId = randomUUID();
const serviceAId = randomUUID();
const serviceBId = randomUUID();
const quoteAId = randomUUID(), quoteBId = randomUUID(), itemAId = randomUUID(), itemBId = randomUUID();
const jobAId = randomUUID(), jobBId = randomUUID(), unassignedJobAId = randomUUID(), reportAId = randomUUID(), reportBId = randomUUID();
const agentAId = randomUUID();
const agentBId = randomUUID();
const globalAgentId = randomUUID();
const runAId = randomUUID();
const runBId = randomUUID();
const otherUserRunId = randomUUID();
const callAId = randomUUID();
const callBId = randomUUID();
const testRunId = randomUUID();
const emailA = `user-a-${testRunId}@example.test`;
const emailB = `user-b-${testRunId}@example.test`;
const passwordA = `Local-A-${testRunId}`;
const passwordB = `Local-B-${testRunId}`;

let adminClient: SupabaseClient | undefined;
let userAClient: SupabaseClient;
let userBClient: SupabaseClient;
let anonymousClient: SupabaseClient;
let authUserAId: string | undefined;
let authUserBId: string | undefined;

function requireLocalUrl(name: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`${name} is required for local integration tests.`);
  }

  const hostname = new URL(value).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`${name} must target localhost; received ${hostname}.`);
  }

  return value;
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for local integration tests.`);
  }
  return value;
}

async function requireSuccessfulOperation(
  operation: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await operation;
  if (error !== null) {
    throw new Error(error.message);
  }
}

async function visibleIds(
  client: SupabaseClient,
  table: "organizations" | "users" | "customers" | "contacts" | "customer_sites" | "leads" | "services" | "agents" | "agent_runs" | "agent_tool_calls",
): Promise<string[]> {
  const { data, error } = await client.from(table).select("id").order("id");
  if (error !== null) {
    throw new Error(error.message);
  }
  return data.map((row) => row.id as string);
}

describe("local Supabase auth and tenant isolation", () => {
  beforeAll(async () => {
    const supabaseUrl = requireLocalUrl(
      "SUPABASE_URL",
      process.env.SUPABASE_URL,
    );
    requireLocalUrl("DATABASE_URL", process.env.DATABASE_URL);
    const publishableKey = requireEnvironmentValue(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );

    adminClient = createAdminSupabaseClient();
    anonymousClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authUserAResult = await adminClient.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
    });
    if (authUserAResult.error !== null) {
      throw new Error(authUserAResult.error.message);
    }
    authUserAId = authUserAResult.data.user.id;

    const authUserBResult = await adminClient.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (authUserBResult.error !== null) {
      throw new Error(authUserBResult.error.message);
    }
    authUserBId = authUserBResult.data.user.id;

    await requireSuccessfulOperation(
      adminClient.from("organizations").insert([
        { id: organizationAId, name: "Fictional Organization A" },
        { id: organizationBId, name: "Fictional Organization B" },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("users").insert([
        {
          id: businessUserAId,
          organization_id: organizationAId,
          auth_user_id: authUserAId,
          first_name: "User",
          last_name: "A",
          email: emailA,
          role: "OWNER",
        },
        {
          id: businessUserBId,
          organization_id: organizationBId,
          auth_user_id: authUserBId,
          first_name: "User",
          last_name: "B",
          email: emailB,
          role: "OWNER",
        },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("customers").insert([
        {
          id: customerAId,
          organization_id: organizationAId,
          type: "company",
          name: "Fictional Customer A",
        },
        {
          id: customerBId,
          organization_id: organizationBId,
          type: "company",
          name: "Fictional Customer B",
        },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("contacts").insert([
        {
          id: contactAId,
          organization_id: organizationAId,
          customer_id: customerAId,
          first_name: "Contact",
          last_name: "A",
        },
        {
          id: contactBId,
          organization_id: organizationBId,
          customer_id: customerBId,
          first_name: "Contact",
          last_name: "B",
        },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("customer_sites").insert([
        {
          id: customerSiteAId,
          organization_id: organizationAId,
          customer_id: customerAId,
          primary_contact_id: contactAId,
          name: "Fictional Site A",
          address_line1: "1 Test Street",
          postal_code: "75001",
          city: "Paris",
        },
        {
          id: customerSiteBId,
          organization_id: organizationBId,
          customer_id: customerBId,
          primary_contact_id: contactBId,
          name: "Fictional Site B",
          address_line1: "2 Test Street",
          postal_code: "69001",
          city: "Lyon",
        },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("leads").insert([
        { id: leadAId, organization_id: organizationAId, company_name: "Fictional Lead A", assigned_user_id: businessUserAId },
        { id: leadBId, organization_id: organizationBId, company_name: "Fictional Lead B", assigned_user_id: businessUserBId },
      ]),
    );
    await requireSuccessfulOperation(
      adminClient.from("services").insert([
        { id: serviceAId, organization_id: organizationAId, code: "DERAT", name: "Fictional Service A", pricing_mode: "fixed" },
        { id: serviceBId, organization_id: organizationBId, code: "DERAT", name: "Fictional Service B", pricing_mode: "fixed" },
      ]),
    );

    await requireSuccessfulOperation(adminClient.from("quotes").insert([
      { id: quoteAId, organization_id: organizationAId, customer_id: customerAId, site_id: customerSiteAId, quote_number: "TEST-A", created_by_user_id: businessUserAId },
      { id: quoteBId, organization_id: organizationBId, customer_id: customerBId, site_id: customerSiteBId, quote_number: "TEST-B", created_by_user_id: businessUserBId },
    ]));
    await requireSuccessfulOperation(adminClient.from("quote_items").insert([
      { id: itemAId, organization_id: organizationAId, quote_id: quoteAId, service_id: serviceAId, description: "Fictional Item A", quantity: "1", unit_price: "100", tax_rate: "20" },
      { id: itemBId, organization_id: organizationBId, quote_id: quoteBId, service_id: serviceBId, description: "Fictional Item B", quantity: "1", unit_price: "100", tax_rate: "20" },
    ]));
    await requireSuccessfulOperation(adminClient.from("jobs").insert([
      { id: jobAId, organization_id: organizationAId, customer_id: customerAId, site_id: customerSiteAId, service_id: serviceAId, quote_id: quoteAId, assigned_user_id: businessUserAId, created_by_user_id: businessUserAId, description: "Fictional Job A" },
      { id: unassignedJobAId, organization_id: organizationAId, customer_id: customerAId, site_id: customerSiteAId, service_id: serviceAId, created_by_user_id: businessUserAId, description: "Fictional unassigned Job A" },
      { id: jobBId, organization_id: organizationBId, customer_id: customerBId, site_id: customerSiteBId, service_id: serviceBId, quote_id: quoteBId, created_by_user_id: businessUserBId, description: "Fictional Job B" },
    ]));
    await requireSuccessfulOperation(adminClient.from("job_reports").insert([
      { id: reportAId, organization_id: organizationAId, job_id: jobAId, technician_id: businessUserAId },
      { id: reportBId, organization_id: organizationBId, job_id: jobBId, technician_id: businessUserBId },
    ]));
    await requireSuccessfulOperation(adminClient.from("agents").insert([
      { id: agentAId, organization_id: organizationAId, code: "director", name: "Director", version: "v1" },
      { id: agentBId, organization_id: organizationBId, code: "director", name: "Director", version: "v1" },
      { id: globalAgentId, code: "global-test", name: "Hidden global test", version: "v1" },
    ]));
    await requireSuccessfulOperation(adminClient.from("agent_runs").insert([
      { id: runAId, organization_id: organizationAId, agent_id: agentAId, triggered_by_type: "user", triggered_by_id: businessUserAId, objective: "Fictional CRM request A", model_name: "mock", correlation_id: randomUUID() },
      { id: runBId, organization_id: organizationBId, agent_id: agentBId, triggered_by_type: "user", triggered_by_id: businessUserBId, objective: "Fictional CRM request B", model_name: "mock", correlation_id: randomUUID() },
      { id: otherUserRunId, organization_id: organizationAId, agent_id: agentAId, triggered_by_type: "user", triggered_by_id: randomUUID(), objective: "Other user hidden trace", model_name: "mock", correlation_id: randomUUID() },
    ]));
    await requireSuccessfulOperation(adminClient.from("agent_tool_calls").insert([
      { id: callAId, organization_id: organizationAId, agent_run_id: runAId, agent_id: agentAId, tool_name: "customers.get", risk_level: 0 },
      { id: callBId, organization_id: organizationBId, agent_run_id: runBId, agent_id: agentBId, tool_name: "customers.get", risk_level: 0 },
    ]));
    await requireSuccessfulOperation(adminClient.from("ai_settings").insert([
      { organization_id: organizationAId }, { organization_id: organizationBId },
    ]));

    userAClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    userBClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const signInA = await userAClient.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    });
    const signInB = await userBClient.auth.signInWithPassword({
      email: emailB,
      password: passwordB,
    });
    if (signInA.error !== null || signInB.error !== null) {
      throw new Error("Unable to authenticate the local integration users.");
    }
  });

  afterAll(async () => {
    if (adminClient === undefined) {
      return;
    }

    await requireSuccessfulOperation(adminClient.from("agent_tool_calls").delete().in("id", [callAId, callBId]));
    await requireSuccessfulOperation(adminClient.from("ai_settings").delete().in("organization_id", [organizationAId, organizationBId]));
    await requireSuccessfulOperation(adminClient.from("agent_runs").delete().in("id", [runAId, runBId, otherUserRunId]));
    await requireSuccessfulOperation(adminClient.from("agents").delete().in("id", [agentAId, agentBId, globalAgentId]));
    await requireSuccessfulOperation(adminClient.from("leads").delete().in("id", [leadAId, leadBId]));
    await requireSuccessfulOperation(adminClient.from("job_reports").delete().in("id", [reportAId, reportBId]));
    await requireSuccessfulOperation(adminClient.from("jobs").delete().in("id", [jobAId, jobBId, unassignedJobAId]));
    await requireSuccessfulOperation(adminClient.from("quote_items").delete().in("id", [itemAId, itemBId]));
    await requireSuccessfulOperation(adminClient.from("quotes").delete().in("id", [quoteAId, quoteBId]));
    await requireSuccessfulOperation(adminClient.from("services").delete().in("id", [serviceAId, serviceBId]));

    await requireSuccessfulOperation(
      adminClient
        .from("customer_sites")
        .delete()
        .in("id", [customerSiteAId, customerSiteBId]),
    );
    await requireSuccessfulOperation(
      adminClient
        .from("contacts")
        .delete()
        .in("id", [contactAId, contactBId]),
    );
    await requireSuccessfulOperation(
      adminClient
        .from("customers")
        .delete()
        .in("id", [customerAId, customerBId]),
    );
    await requireSuccessfulOperation(
      adminClient
        .from("users")
        .delete()
        .in("id", [businessUserAId, businessUserBId]),
    );
    await requireSuccessfulOperation(
      adminClient
        .from("organizations")
        .delete()
        .in("id", [organizationAId, organizationBId]),
    );

    if (authUserAId !== undefined) {
      const { error } = await adminClient.auth.admin.deleteUser(authUserAId);
      if (error !== null) {
        throw new Error(error.message);
      }
    }
    if (authUserBId !== undefined) {
      const { error } = await adminClient.auth.admin.deleteUser(authUserBId);
      if (error !== null) {
        throw new Error(error.message);
      }
    }
  });

  it("authenticates both users and resolves membership from public.users", async () => {
    await expect(resolveCurrentBusinessUser(userAClient)).resolves.toEqual({
      authUserId: authUserAId,
      userId: businessUserAId,
      organizationId: organizationAId,
      role: "OWNER",
    });
    await expect(resolveCurrentBusinessUser(userBClient)).resolves.toEqual({
      authUserId: authUserBId,
      userId: businessUserBId,
      organizationId: organizationBId,
      role: "OWNER",
    });
  });

  it.each([
    ["users", { status: "inactive" }],
    ["users", { status: "suspended" }],
    ["users", { status: "unknown-status" }],
    ["users", { deleted_at: "2026-01-01T00:00:00Z" }],
    ["organizations", { status: "inactive" }],
    ["organizations", { deleted_at: "2026-01-01T00:00:00Z" }],
  ] as const)("revokes context and tenant access with a still-valid session: %s %j", async (table, change) => {
    const targetId = table === "users" ? businessUserAId : organizationAId;
    await requireSuccessfulOperation(adminClient!.from(table).update(change).eq("id", targetId));
    try {
      const identity = await userAClient.auth.getUser();
      expect(identity.error).toBeNull();
      expect(identity.data.user?.id).toBe(authUserAId);
      await expect(resolveCurrentBusinessUser(userAClient)).rejects.toThrow("No active First AI user");
      const tenant = await userAClient.rpc("current_organization_id");
      expect(tenant.error).toBeNull();
      expect(tenant.data).toBeNull();

      for (const [businessTable, ownId, column] of [
        ["organizations", organizationAId, "id"], ["users", businessUserAId, "id"],
        ["customers", customerAId, "id"], ["contacts", contactAId, "id"],
        ["customer_sites", customerSiteAId, "id"], ["leads", leadAId, "id"],
        ["services", serviceAId, "id"], ["quotes", quoteAId, "id"],
        ["quote_items", itemAId, "id"], ["jobs", jobAId, "id"],
        ["job_reports", reportAId, "id"], ["agents", agentAId, "id"],
        ["agent_runs", runAId, "id"], ["agent_tool_calls", callAId, "id"],
        ["ai_settings", organizationAId, "organization_id"],
      ] as const) {
        const list = await userAClient.from(businessTable).select(column);
        expect(list.error).toBeNull(); expect(list.data).toEqual([]);
        const directId = await userAClient.from(businessTable).select(column).eq(column, ownId).maybeSingle();
        expect(directId.error).toBeNull(); expect(directId.data).toBeNull();
      }
      const deniedWrite = await userAClient.from("ai_settings")
        .update({ mode: "CLOUD_ONLY" }).eq("organization_id", organizationAId).select();
      expect(deniedWrite.error).toBeNull(); expect(deniedWrite.data).toEqual([]);
      // Positive controls: rows still exist and the other tenant remains active.
      const control = await adminClient!.from("leads").select("id").eq("id", leadAId);
      expect(control.error).toBeNull(); expect(control.data).toEqual([{ id: leadAId }]);
      await expect(resolveCurrentBusinessUser(userBClient)).resolves.toMatchObject({ organizationId: organizationBId });
    } finally {
      await requireSuccessfulOperation(adminClient!.from(table).update({ status: "active", deleted_at: null }).eq("id", targetId));
    }
    await expect(resolveCurrentBusinessUser(userAClient)).resolves.toMatchObject({ organizationId: organizationAId });
    await expect(visibleIds(userAClient, "leads")).resolves.toEqual([leadAId]);
  });

  it.each(["OWNER", "ADMIN", "MANAGER", "READ_ONLY", "TECHNICIAN", "ACCOUNTANT"] as const)(
    "matches direct lead RLS to %s service permissions, including known IDs", async (role) => {
      await requireSuccessfulOperation(adminClient!.from("users").update({ role }).eq("id", businessUserAId));
      try {
        await expect(resolveCurrentBusinessUser(userAClient)).resolves.toMatchObject({ role });
        const allowed = hasPermission(role, "leads.read");
        const list = await userAClient.from("leads").select("id");
        expect(list.error).toBeNull(); expect(list.data).toEqual(allowed ? [{ id: leadAId }] : []);
        const knownId = await userAClient.from("leads").select("id").eq("id", leadAId).maybeSingle();
        expect(knownId.error).toBeNull(); expect(knownId.data).toEqual(allowed ? { id: leadAId } : null);
        const foreignId = await userAClient.from("leads").select("id").eq("id", leadBId).maybeSingle();
        expect(foreignId.error).toBeNull(); expect(foreignId.data).toBeNull();
        const count = await userAClient.from("leads").select("id", { count: "exact", head: true });
        expect(count.error).toBeNull(); expect(count.count).toBe(allowed ? 1 : 0);
        const control = await adminClient!.from("leads").select("id").in("id", [leadAId, leadBId]);
        expect(control.error).toBeNull(); expect(control.data).toHaveLength(2);
      } finally {
        await requireSuccessfulOperation(adminClient!.from("users").update({ role: "OWNER" }).eq("id", businessUserAId));
      }
    },
  );

  it("isolates operational records, including exact UUID attacks and anonymous reads", async () => {
    for (const [table, ownA, ownB] of [["quotes", quoteAId, quoteBId], ["quote_items", itemAId, itemBId], ["jobs", jobAId, jobBId], ["job_reports", reportAId, reportBId]] as const) {
      for (const [client, own, foreign] of [[userAClient, ownA, ownB], [userBClient, ownB, ownA]] as const) {
        const ownRead = await client.from(table).select("id").eq("id", own); expect(ownRead.error).toBeNull(); expect(ownRead.data).toEqual([{ id: own }]);
        const attack = await client.from(table).select("id").eq("id", foreign).maybeSingle(); expect(attack.error).toBeNull(); expect(attack.data).toBeNull();
        const list = await client.from(table).select("id"); expect(list.error).toBeNull(); expect(list.data?.map(row => row.id)).not.toContain(foreign);
      }
      const anonymous = await anonymousClient.from(table).select("id"); expect(anonymous.error).toBeNull(); expect(anonymous.data).toEqual([]);
      const control = await adminClient!.from(table).select("id").in("id", [ownA, ownB]); expect(control.error).toBeNull(); expect(control.data).toHaveLength(2);
    }
  });
  it("enforces technician assignment and denies direct authenticated operational writes", async () => {
    await requireSuccessfulOperation(adminClient!.from("users").update({ role: "TECHNICIAN" }).eq("id", businessUserAId));
    try {
      const assigned = await userAClient.from("jobs").select("id"); expect(assigned.error).toBeNull(); expect(assigned.data).toEqual([{ id: jobAId }]);
      const unassigned = await userAClient.from("jobs").select("id").eq("id", unassignedJobAId); expect(unassigned.error).toBeNull(); expect(unassigned.data).toEqual([]);
      for (const table of ["quotes", "quote_items"] as const) { const denied = await userAClient.from(table).select("id"); expect(denied.error).toBeNull(); expect(denied.data).toEqual([]); }
      const deniedWrite = await userAClient.from("job_reports").update({ observations: "Unauthorized direct write" }).eq("id", reportAId).select(); expect(deniedWrite.error).toBeNull(); expect(deniedWrite.data).toEqual([]);
    } finally { await requireSuccessfulOperation(adminClient!.from("users").update({ role: "OWNER" }).eq("id", businessUserAId)); }
  });

  it("isolates runtime settings reads and writes even by known organization UUID", async () => {
    for (const [client, own, foreign] of [[userAClient, organizationAId, organizationBId], [userBClient, organizationBId, organizationAId]] as const) {
      const list = await client.from("ai_settings").select("organization_id");
      expect(list.error).toBeNull(); expect(list.data).toEqual([{ organization_id: own }]);
      const attack = await client.from("ai_settings").update({ local_standard_model: "malicious-change" }).eq("organization_id", foreign).select();
      expect(attack.error).toBeNull(); expect(attack.data).toEqual([]);
      const ownUpdate = await client.from("ai_settings").update({ local_standard_model: "qwen3:14b" }).eq("organization_id", own).select("local_standard_model");
      expect(ownUpdate.error).toBeNull(); expect(ownUpdate.data).toEqual([{ local_standard_model: "qwen3:14b" }]);
    }
    const anonymous = await anonymousClient.from("ai_settings").select("organization_id");
    expect(anonymous.error).toBeNull(); expect(anonymous.data).toEqual([]);
    await requireSuccessfulOperation(adminClient!.from("users").update({ role: "MANAGER" }).eq("id", businessUserAId));
    try {
      const denied = await userAClient.from("ai_settings").update({ mode: "CLOUD_ONLY" }).eq("organization_id", organizationAId).select();
      expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    } finally { await requireSuccessfulOperation(adminClient!.from("users").update({ role: "OWNER" }).eq("id", businessUserAId)); }
  });

  it("isolates all tenant-owned reads symmetrically", async () => {
    await expect(visibleIds(userAClient, "organizations")).resolves.toEqual([
      organizationAId,
    ]);
    await expect(visibleIds(userAClient, "users")).resolves.toEqual([
      businessUserAId,
    ]);
    await expect(visibleIds(userAClient, "customers")).resolves.toEqual([
      customerAId,
    ]);
    await expect(visibleIds(userAClient, "contacts")).resolves.toEqual([
      contactAId,
    ]);
    await expect(visibleIds(userAClient, "customer_sites")).resolves.toEqual([
      customerSiteAId,
    ]);
    await expect(visibleIds(userAClient, "leads")).resolves.toEqual([leadAId]);
    await expect(visibleIds(userAClient, "services")).resolves.toEqual([serviceAId]);

    await expect(visibleIds(userBClient, "organizations")).resolves.toEqual([
      organizationBId,
    ]);
    await expect(visibleIds(userBClient, "users")).resolves.toEqual([
      businessUserBId,
    ]);
    await expect(visibleIds(userBClient, "customers")).resolves.toEqual([
      customerBId,
    ]);
    await expect(visibleIds(userBClient, "contacts")).resolves.toEqual([
      contactBId,
    ]);
    await expect(visibleIds(userBClient, "customer_sites")).resolves.toEqual([
      customerSiteBId,
    ]);
    await expect(visibleIds(userBClient, "leads")).resolves.toEqual([leadBId]);
    await expect(visibleIds(userBClient, "services")).resolves.toEqual([serviceBId]);
  });

  it("blocks direct-ID attacks across tenant boundaries", async () => {
    for (const [table, foreignId] of [
      ["customers", customerBId],
      ["contacts", contactBId],
      ["customer_sites", customerSiteBId],
      ["leads", leadBId],
      ["services", serviceBId],
    ] as const) {
      const { data, error } = await userAClient
        .from(table)
        .select("id")
        .eq("id", foreignId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    }

    for (const [table, foreignId] of [
      ["customers", customerAId],
      ["contacts", contactAId],
      ["customer_sites", customerSiteAId],
      ["leads", leadAId],
      ["services", serviceAId],
    ] as const) {
      const { data, error } = await userBClient
        .from(table)
        .select("id")
        .eq("id", foreignId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
  });

  it("blocks anonymous business-data reads", async () => {
    await expect(visibleIds(anonymousClient, "customers")).resolves.toEqual([]);
    await expect(visibleIds(anonymousClient, "users")).resolves.toEqual([]);
    await expect(visibleIds(anonymousClient, "leads")).resolves.toEqual([]);
    await expect(visibleIds(anonymousClient, "services")).resolves.toEqual([]);
  });

  it("allows the server-only service role to confirm both tenants exist", async () => {
    await expect(visibleIds(adminClient!, "organizations")).resolves.toEqual(
      expect.arrayContaining([organizationAId, organizationBId]),
    );
    await expect(visibleIds(adminClient!, "customers")).resolves.toEqual(
      expect.arrayContaining([customerAId, customerBId]),
    );
  });

  it("rejects cross-organization relational corruption", async () => {
    const invalidContact = await adminClient!.from("contacts").insert({
      id: randomUUID(),
      organization_id: organizationAId,
      customer_id: customerBId,
      first_name: "Invalid",
      last_name: "Contact",
    });
    expect(invalidContact.error?.code).toBe("23503");

    const invalidSite = await adminClient!.from("customer_sites").insert({
      id: randomUUID(),
      organization_id: organizationAId,
      customer_id: customerBId,
      name: "Invalid Site",
      address_line1: "3 Test Street",
      postal_code: "13001",
      city: "Marseille",
    });
    expect(invalidSite.error?.code).toBe("23503");

    const invalidPrimaryContact = await adminClient!
      .from("customer_sites")
      .insert({
        id: randomUUID(),
        organization_id: organizationAId,
        customer_id: customerAId,
        primary_contact_id: contactBId,
        name: "Invalid Contact Site",
        address_line1: "4 Test Street",
        postal_code: "31000",
        city: "Toulouse",
      });
    expect(invalidPrimaryContact.error?.code).toBe("23503");

    const invalidLead = await adminClient!.from("leads").insert({
      id: randomUUID(), organization_id: organizationAId, company_name: "Invalid Lead", assigned_user_id: businessUserBId,
    });
    expect(invalidLead.error?.code).toBe("23503");
  });

  it("enforces service-code uniqueness per organization", async () => {
    const duplicate = await adminClient!.from("services").insert({
      id: randomUUID(), organization_id: organizationAId, code: "DERAT", name: "Duplicate", pricing_mode: "fixed",
    });
    expect(duplicate.error?.code).toBe("23505");
  });

  it("isolates agent definitions, runs and tool calls, including exact UUIDs", async () => {
    for (const [client, ownAgent, ownRun, ownCall, foreignRun, foreignCall] of [
      [userAClient, agentAId, runAId, callAId, runBId, callBId],
      [userBClient, agentBId, runBId, callBId, runAId, callAId],
    ] as const) {
      await expect(visibleIds(client, "agents")).resolves.toEqual([ownAgent]);
      await expect(visibleIds(client, "agent_runs")).resolves.toEqual([ownRun]);
      await expect(visibleIds(client, "agent_tool_calls")).resolves.toEqual([ownCall]);
      for (const [table, id] of [["agent_runs", foreignRun], ["agent_tool_calls", foreignCall], ["agents", globalAgentId]] as const) {
        const result = await client.from(table).select("id").eq("id", id).maybeSingle();
        expect(result.error).toBeNull(); expect(result.data).toBeNull();
      }
    }
    for (const table of ["agents", "agent_runs", "agent_tool_calls"] as const) {
      await expect(visibleIds(anonymousClient, table)).resolves.toEqual([]);
    }
    await expect(visibleIds(adminClient!, "agent_runs")).resolves.toEqual(expect.arrayContaining([runAId, runBId, otherUserRunId]));
    await expect(visibleIds(adminClient!, "agent_tool_calls")).resolves.toEqual(expect.arrayContaining([callAId, callBId]));
  });

  it("rejects cross-tenant agent/run/call relationships and authenticated writes", async () => {
    const invalidRun = await adminClient!.from("agent_runs").insert({
      organization_id: organizationAId, agent_id: agentBId, triggered_by_type: "user", triggered_by_id: businessUserAId,
      objective: "Invalid test run", model_name: "mock", correlation_id: randomUUID(),
    });
    expect(invalidRun.error?.code).toBe("23503");
    const invalidParent = await adminClient!.from("agent_runs").insert({
      organization_id: organizationAId, agent_id: agentAId, parent_run_id: runBId,
      triggered_by_type: "user", triggered_by_id: businessUserAId, objective: "Invalid parent",
      model_name: "mock", correlation_id: randomUUID(),
    });
    expect(invalidParent.error?.code).toBe("23503");
    const invalidCall = await adminClient!.from("agent_tool_calls").insert({
      organization_id: organizationAId, agent_run_id: runBId, agent_id: agentAId, tool_name: "customers.get", risk_level: 0,
    });
    expect(invalidCall.error?.code).toBe("23503");
    const userWrite = await userAClient.from("agent_tool_calls").insert({
      organization_id: organizationAId, agent_run_id: runAId, agent_id: agentAId, tool_name: "customers.get", risk_level: 0,
    });
    expect(userWrite.error?.code).toBe("42501");
  });
});
