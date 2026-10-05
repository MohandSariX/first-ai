import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUserRole, type UserRole } from "./roles.js";

export interface CurrentBusinessUser {
  readonly authUserId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: UserRole;
}

export async function resolveCurrentBusinessUser(
  supabase: SupabaseClient,
): Promise<CurrentBusinessUser> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError !== null || authData.user === null) {
    throw new Error("An authenticated Supabase user is required.");
  }

  const { data: businessUser, error: businessUserError } = await supabase
    .from("users")
    .select("id, auth_user_id, organization_id, role, status, deleted_at")
    .eq("auth_user_id", authData.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (businessUserError !== null) {
    throw new Error("Unable to resolve the authenticated First AI user.");
  }

  if (
    businessUser === null ||
    businessUser.status !== "active" ||
    businessUser.deleted_at !== null ||
    businessUser.auth_user_id !== authData.user.id ||
    typeof businessUser.id !== "string" ||
    typeof businessUser.organization_id !== "string" ||
    !isUserRole(businessUser.role)
  ) {
    throw new Error("No active First AI user is linked to this identity.");
  }

  // Check explicitly even though authenticated reads also enforce this through
  // RLS. A privileged client must not turn an inactive tenant into trusted scope.
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, status, deleted_at")
    .eq("id", businessUser.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (organizationError !== null) {
    throw new Error("Unable to resolve the authenticated First AI organization.");
  }

  if (
    organization === null ||
    organization.id !== businessUser.organization_id ||
    organization.status !== "active" ||
    organization.deleted_at !== null
  ) {
    throw new Error("No active First AI organization is linked to this identity.");
  }

  return {
    authUserId: authData.user.id,
    userId: businessUser.id,
    organizationId: businessUser.organization_id,
    role: businessUser.role,
  };
}
