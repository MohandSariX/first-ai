import "server-only";

import { createServerSupabaseClient, resolveCurrentBusinessUser, type CurrentBusinessUser } from "@first-ai/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function supabaseServerClient() {
  const store = await cookies();
  return createServerSupabaseClient({
    getAll: () => store.getAll(),
    setAll: (values) => {
      try {
        values.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Server Components cannot always write refreshed cookies; actions can.
      }
    },
  });
}

export async function requireBusinessUser(): Promise<CurrentBusinessUser> {
  try {
    return await resolveCurrentBusinessUser(await supabaseServerClient());
  } catch {
    redirect("/login");
  }
}

export async function signIn(email: string, password: string): Promise<boolean> {
  const { error } = await (await supabaseServerClient()).auth.signInWithPassword({ email, password });
  return error === null;
}

export async function signOut(): Promise<void> {
  await (await supabaseServerClient()).auth.signOut();
}
