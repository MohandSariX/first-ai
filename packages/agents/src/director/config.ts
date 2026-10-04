export const DIRECTOR_CONFIG = Object.freeze({
  code: "director", version: "v1", name: "Director", modelProfile: "LOCAL_STANDARD" as const,
  autonomyLevel: 0, maxIterations: 6, maxToolCalls: 12, maxDelegations: 0,
  timeoutMs: 60_000, maxOutputTokens: 1500, maxResultCharacters: 8000,
  maxTotalTokens: 30_000,
});
