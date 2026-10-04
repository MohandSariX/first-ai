import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminSupabaseClient } from "./admin.js";
import { resolveCurrentBusinessUser } from "./current-user.js";

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
  table: "organizations" | "users" | "customers" | "contacts" | "customer_sites" | "leads" | "services",
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

    await requireSuccessfulOperation(adminClient.from("leads").delete().in("id", [leadAId, leadBId]));
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
});
