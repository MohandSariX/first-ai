import "server-only";

import { createServerClient } from "@supabase/ssr";

interface CookieValue {
  readonly name: string;
  readonly value: string;
}

interface CookieToSet extends CookieValue {
  readonly options?: object;
}

export interface ServerCookieStore {
  getAll(): readonly CookieValue[];
  setAll(cookies: readonly CookieToSet[]): void | Promise<void>;
}

export function createServerSupabaseClient(cookieStore: ServerCookieStore) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl === undefined || publishableKey === undefined) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
    );
  }

  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => [...cookieStore.getAll()],
      setAll: (cookies) => cookieStore.setAll(cookies),
    },
  });
}

export type { CurrentBusinessUser } from "./current-user.js";
export { resolveCurrentBusinessUser } from "./current-user.js";
