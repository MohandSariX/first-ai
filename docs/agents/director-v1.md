# Director v1

Director is a text-only, single-agent, read-only CRM assistant. Cloud execution uses
Responses through the official `@openai/agents` package; local execution uses Ollama.
Both implement the same internal execution port. The versioned instructions
and allowlist live in `packages/agents/src/director`.

The server resolves Supabase identity → First AI membership → tenant/role. Neither
chat input nor function schemas accepts trusted scope. Tools close over an immutable
server context and reuse CRM services (including role checks) and scoped repositories.
The SDK names encode dots as underscores; persisted tool names retain domain.action.

Only Risk 0 read permissions are registered; restricted roles receive no lead tools.
The operational milestone adds quote, job and report reads only. Technicians receive
no quote tools, and job services restrict them to assigned interventions; accountants
receive no report tools. Neither hybrid provider receives create/accept/schedule/complete
tools. See [operational foundation](../architecture/quotes-jobs.md) for these boundaries.
Aggregate tools use database counts, not paginated result lengths. Search is bounded
to 20 records; results and strings are bounded and redacted. Tool results remain
untrusted data, never system instructions. No CRM writes or handoffs are possible.

Runtime profiles are LOCAL_FAST, LOCAL_STANDARD, CLOUD_STANDARD and CLOUD_REASONING.
Organization settings select HYBRID (default), LOCAL_ONLY or CLOUD_ONLY, provider
models and bounded fallback. New runs read current settings without restart.
See [hybrid architecture](../architecture/hybrid-ai.md) for defaults, classification,
resource limits and future hardware/model switching. OPENAI_API_KEY remains server-only.

Bounds: six model turns, twelve tool calls, zero delegations, 60-second deadline,
1,500 cloud / 512 local output tokens per model request and a 30,000-token observed run budget.
The token budget is checked between requests; one in-flight request can cross it.
No monetary budget is claimed without a reviewed pricing source; estimated_cost is
null. This is interactive read-only execution, not an autonomous background loop.

Run and tool-call records are persisted through an injected storage port. Only
objective, safe tool input/output, final text, status, counters and usage are stored.
No SDK history, reasoning items or private chain of thought are persisted. SDK tracing
is enabled with sensitive data excluded; local persistence does not depend on it.
Redaction recognizes common key/password/JWT/connection-string formats; it cannot
detect every possible secret. The UI warns users not to submit secrets.

Director definitions are created lazily per tenant/version, not seeded globally.
Composite foreign keys bind runs, parent runs and tool calls to their tenant/agent.
All three tables have read-only RLS; global definitions are hidden. Runs and tool calls
are additionally restricted to their triggering business user, preventing a role
from reading another user's privileged CRM tool results through observability.
There are no authenticated write policies. model_name is stored per run so an
environment model change cannot overwrite the historical model selection.

The UI keeps only the last 20 visible messages locally, sends just the current request,
and renders allowlisted safe Markdown (no HTML execution, simulated streaming or persisted chat).
Assistant failures leave the manual CRM intact. Local integration and E2E tests use
no OpenAI network calls; normal unit tests inject deterministic executors.
