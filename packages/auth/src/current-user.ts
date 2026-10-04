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
    .select("id, auth_user_id, organization_id, role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (businessUserError !== null) {
    throw new Error("Unable to resolve the authenticated First AI user.");
  }

  if (
    businessUser === null ||
    businessUser.auth_user_id !== authData.user.id ||
    typeof businessUser.id !== "string" ||
    typeof businessUser.organization_id !== "string" ||
    !isUserRole(businessUser.role)
  ) {
    throw new Error("No active First AI user is linked to this identity.");
  }

  return {
    authUserId: authData.user.id,
    userId: businessUser.id,
    organizationId: businessUser.organization_id,
    role: businessUser.role,
  };
}
