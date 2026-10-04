import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server administration.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
