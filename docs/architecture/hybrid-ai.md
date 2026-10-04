# Hybrid AI Foundation

First AI agents depend on an internal `AiProvider` execution contract. The hybrid
router selects a provider/profile/model; adapters implement that contract. OpenAI
uses the existing official Agents SDK Responses runner. Ollama uses the official
native `/api/tags` and `/api/chat` APIs, including function tools. Neither adapter
gets database access or additional tools. Tools → CRM services → scoped repositories
remain the only business-data path.

## Runtime configuration

`ai_settings` has one row per organization (organization UUID primary key/FK).
It stores mode, loopback Ollama URL, four model assignments, fallback flag and UTC
update timestamp, never credentials. Rows initialize lazily with HYBRID defaults.
Each run reads current settings, with no cache, rebuild or restart required.
Owner/Admin updates are checked in the service and PostgreSQL RLS. Other business
users can view only their organization's settings. Anonymous access and cross-tenant
updates are denied. There is no delete policy.

Current 8 GB development defaults are `qwen3:1.7b` (LOCAL_FAST) and
`qwen3:4b-instruct` (LOCAL_STANDARD). Cloud defaults retain `gpt-5.4-mini`
(CLOUD_STANDARD) and `gpt-5.4` (CLOUD_REASONING). Environment model variables supply
initial defaults only; saved settings are authoritative. `OPENAI_API_KEY` remains
server-only environment configuration. No model downloads are performed by First AI.

Use `/settings/ai` to select an installed model or enter a model name manually.
After upgrading hardware, install the desired model with Ollama separately, then
select e.g. `qwen3:8b`, `qwen3:14b` or `qwen3:30b` there. No RAM restriction is
encoded in CRM or agent business logic. An absent model produces a clear local
failure (or configured hybrid fallback), not an automatic download.

## Routing and fallback

Deterministic normalized-text heuristics classify SIMPLE_LOOKUP, SUMMARY,
STANDARD_ANALYSIS, COMPLEX_REASONING and SENSITIVE_REASONING. These are routing
classes, not new business capabilities: Director still cannot provide unavailable
finance, legal or tax data.
The router also accepts the trusted versioned agent profile preference. Director's
default is LOCAL_STANDARD; organization LOCAL_ONLY always overrides cloud preferences.

| Mode | Lookup | Summary / analysis | Complex / sensitive |
| --- | --- | --- | --- |
| HYBRID | LOCAL_FAST | LOCAL_STANDARD | CLOUD_REASONING |
| LOCAL_ONLY | LOCAL_FAST | LOCAL_STANDARD | LOCAL_STANDARD |
| CLOUD_ONLY | CLOUD_STANDARD | CLOUD_STANDARD | CLOUD_REASONING |

Local → cloud fallback is allowed only in HYBRID with fallback enabled, for
OLLAMA_UNAVAILABLE, OLLAMA_MODEL_MISSING, OLLAMA_TIMEOUT or
OLLAMA_INVALID_RESPONSE. One cloud attempt follows; no recursive fallback or
wording-quality retry exists. Authorization, tool, budget, cancellation and busy
errors are not fallback triggers. Missing cloud credentials fail only that AI
request, without breaking the CRM. LOCAL_ONLY never calls the cloud provider.

Fallback reuses the run UUID, authenticated context, correlation UUID, same
permission-filtered Risk 0 tool closures, shared tool budget, cumulative usage and
remaining iteration budget. Cloud restarts the original question, not untrusted
local model instructions/history. Already-read facts may be fetched again; every
call still counts. No prior private reasoning is transferred or persisted.

## Resource and security bounds

One local execution at a time per Node process, including across adapter instances;
a second receives OLLAMA_BUSY. Multi-process production scheduling is outside this
local foundation. Local timeout is 35 seconds inside the original 60-second run
deadline. Both attempts share six model requests, twelve tool calls and the observed
30,000-token budget. Local output is capped at 512 tokens/request with an 8,192-token
context window, accumulated message context is bounded, tool output previews are
bounded to 2,500 characters and no conversation history is forwarded.

Ollama URLs accept only HTTP localhost/127.0.0.1 origins, with no credentials, path,
query or fragment. Requests use fixed endpoints, refuse redirects, bound response
bytes and validate external JSON with Zod. This prevents arbitrary remote HTTP/SSRF
configuration. A deployed server's loopback is its own machine, not the browser's;
remote deployments need a separately reviewed local-provider network design.

`agent_runs` adds provider, model_profile, routing_class, fallback_used and
fallback_reason; existing model_name records the final selected model. Historical
rows keep nullable unknown routing metadata. Legacy PostgreSQL profile values are
retained for migration compatibility; runtime profiles are the four hybrid values.
Tool-call logging, redaction, requester-only trace RLS and tenant constraints remain
unchanged. Tokens accumulate across attempts when reported; costs remain null.

Assistant output uses an allowlisted Markdown renderer without raw HTML, links,
images or arbitrary attributes. A subtle Local/Cloud model label shows routing.

## Validation and development

`pnpm test` uses mocks and requires neither provider. Local Supabase integration
tests prove settings isolation, admin-only writes and run metadata persistence.
Playwright covers settings persistence and safe Markdown, without live AI calls.
`pnpm test:ollama` is an explicit loopback-only smoke test with one fictional read
tool, two bounded model turns, timing/token counters and no OpenAI dependency.
It requires the configured local standard model to already be installed.

Application migrations remain solely under `packages/database/drizzle`. This phase
adds migration 0005, does not edit 0000–0004 and creates no competing Supabase history.

API references: [OpenAI SDK models/providers](https://developers.openai.com/api/docs/guides/agents/models),
[Ollama chat](https://docs.ollama.com/api/chat), [Ollama model discovery](https://docs.ollama.com/api/tags).
