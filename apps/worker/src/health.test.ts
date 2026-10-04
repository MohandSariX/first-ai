import { describe, expect, it } from "vitest";

import { getWorkerHealth } from "./health.js";

describe("worker health", () => {
  it("returns a deterministic healthy status", () => {
    expect(getWorkerHealth()).toEqual({
      status: "ok",
      service: "first-ai-worker",
    });
  });
});
