import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { e2eFixture } from "./fixture";

function requireLocal(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required for local E2E tests.`);
  const hostname = new URL(value).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") throw new Error(`E2E tests refuse non-local ${name}: ${hostname}`);
  return value;
}

export default async function globalSetup() {
  const supabaseUrl = requireLocal("SUPABASE_URL");
  requireLocal("DATABASE_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey === undefined) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for local E2E tests.");
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const organizationId = randomUUID();
  const businessUserId = randomUUID();
  const authResult = await admin.auth.admin.createUser({ email: e2eFixture.email, password: e2eFixture.password, email_confirm: true });
  if (authResult.error !== null) throw new Error(authResult.error.message);
  const authUserId = authResult.data.user.id;
  const organizationResult = await admin.from("organizations").insert({ id: organizationId, name: e2eFixture.organizationName });
  if (organizationResult.error !== null) throw new Error(organizationResult.error.message);
  const userResult = await admin.from("users").insert({ id: businessUserId, organization_id: organizationId, auth_user_id: authUserId, first_name: "Utilisateur", last_name: "E2E", email: e2eFixture.email, role: "OWNER" });
  if (userResult.error !== null) throw new Error(userResult.error.message);

  return async () => {
    const customerCleanup = await admin.from("customers").delete().eq("organization_id", organizationId);
    if (customerCleanup.error !== null) throw new Error(customerCleanup.error.message);
    const userCleanup = await admin.from("users").delete().eq("id", businessUserId);
    if (userCleanup.error !== null) throw new Error(userCleanup.error.message);
    const organizationCleanup = await admin.from("organizations").delete().eq("id", organizationId);
    if (organizationCleanup.error !== null) throw new Error(organizationCleanup.error.message);
    const authCleanup = await admin.auth.admin.deleteUser(authUserId);
    if (authCleanup.error !== null) throw new Error(authCleanup.error.message);
  };
}
