import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabaseClient } from "./client.js";

describe("database client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails clearly without DATABASE_URL and does not open a connection", () => {
    vi.stubEnv("DATABASE_URL", "");

    expect(() => createDatabaseClient()).toThrowError(
      "DATABASE_URL is required to create the server-side database client.",
    );
  });
});
