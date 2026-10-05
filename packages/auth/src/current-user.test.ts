import { AuthError, createClient, type User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { resolveCurrentBusinessUser } from "./current-user.js";

const authUser: User = {
  id: "authenticated-identity",
  app_metadata: {},
  user_metadata: { organizationId: "untrusted-browser-tenant" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};
const membership = {
  id: "business-user", auth_user_id: authUser.id, organization_id: "trusted-tenant",
  role: "OWNER", status: "active", deleted_at: null,
};
const organization = { id: membership.organization_id, status: "active", deleted_at: null };

function setup(userRow: unknown = membership, organizationRow: unknown = organization) {
  // Real PostgREST query construction, mocked transport only: never a DB call.
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const row = url.pathname.endsWith("/users") ? userRow : organizationRow;
    return new Response(JSON.stringify(row), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  const client = createClient("http://127.0.0.1:54321", "unit-test-public-placeholder", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: authUser }, error: null });
  return { client, fetch };
}

describe("trusted active business membership", () => {
  it("uses the authenticated membership, not client metadata, and filters active undeleted rows", async () => {
    const { client, fetch } = setup();
    await expect(resolveCurrentBusinessUser(client)).resolves.toEqual({
      authUserId: authUser.id, userId: membership.id, organizationId: organization.id, role: "OWNER",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [input] of fetch.mock.calls) {
      const query = new URL(String(input)).searchParams;
      expect(query.get("status")).toBe("eq.active");
      expect(query.get("deleted_at")).toBe("is.null");
    }
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("auth_user_id")).toBe(`eq.${authUser.id}`);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("id")).toBe(`eq.${organization.id}`);
  });

  it.each([
    null,
    { ...membership, status: "inactive" },
    { ...membership, status: "suspended" },
    { ...membership, status: "unexpected-status" },
    { ...membership, deleted_at: "2026-01-01T00:00:00Z" },
    { ...membership, auth_user_id: "foreign-identity" },
    { ...membership, role: "UNKNOWN" },
  ])("rejects unavailable or invalid memberships even if transport returns them: %j", async (row) => {
    const { client, fetch } = setup(row);
    await expect(resolveCurrentBusinessUser(client)).rejects.toThrow("No active First AI user");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { ...organization, status: "inactive" },
    { ...organization, status: "suspended" },
    { ...organization, deleted_at: "2026-01-01T00:00:00Z" },
    { ...organization, id: "foreign-tenant" },
  ])("rejects unavailable or invalid organizations: %j", async (row) => {
    const { client } = setup(membership, row);
    await expect(resolveCurrentBusinessUser(client)).rejects.toThrow("No active First AI organization");
  });

  it("requires a verified authenticated identity before querying membership", async () => {
    const { client, fetch } = setup();
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: null }, error: new AuthError("No session") });
    await expect(resolveCurrentBusinessUser(client)).rejects.toThrow("authenticated Supabase user");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a safe resolution error for failed membership queries", async () => {
    const { client, fetch } = setup();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "private DB detail" }), { status: 500 }));
    await expect(resolveCurrentBusinessUser(client)).rejects.toThrow("Unable to resolve the authenticated First AI user.");
  });

  it("returns a safe resolution error for failed organization queries", async () => {
    const { client, fetch } = setup();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(membership), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "private DB detail" }), { status: 500 }));
    await expect(resolveCurrentBusinessUser(client)).rejects.toThrow("Unable to resolve the authenticated First AI organization.");
  });
});
