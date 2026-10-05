# Specialist agents v1 and human approval

`pricing:v1`, `planning:v1`, `technician:v1` reuse the Director execution port,
HybridModelRouter, trusted server session, bounded tools and run/tool observability.
Definitions and instructions: `packages/agents/src/specialists.ts`.

## Routing and capabilities

At most one deterministic delegation before inference: devis/prix/marge → Pricing;
planning/créneau/planifier → Planning; terrain/rapport/technicien → Technician.
Pricing wins ambiguous matches, then Planning. Explicit selection accepts only these
three agents, not provider/model/tenant context. One routed specialist run, not two
model runs or recursive SDK handoffs. Final-output metadata records `agentCode` and
`delegatedBy` for automatic routing. Director still has only its 22 Risk 0 reads.

| Specialist | Reads | Proposals |
| --- | --- | --- |
| Pricing | Customers, sites, catalog, quotes, pure calculateTotals | Draft quote, add/update item, mark ready |
| Planning | Jobs/search/today; active technicians for planning-authorized roles | Schedule, reschedule, assign |
| Technician | Accessible jobs/search/today, reports | Start, draft/update/complete report, complete job |

Services enforce role, assignment and report ownership. No lead tools, quote
acceptance, arbitrary execution or invented chemicals/products/stock. Money remains
existing deterministic BigInt/decimal calculations. Bounded planning searches cannot
guarantee absence of conflicts: execution always checks overlaps.

Existing runtime settings/modes/fallback apply unchanged. LOCAL_ONLY never calls
cloud. One local model per process, 6 turns, 12 calls, 60 seconds and existing
context/token/output bounds. No specialist delegation tools, parallel local runs,
background autonomy, new model names or downloads.

## Persistent proposal boundary

Risk 1 `proposals.*` tools create pending approval records only, **not business
mutations**. No agent can approve/reject/execute. `APPROVAL_ACTIONS` in
`packages/tools/src/approval-service.ts` is the fixed execution registry, with
strict payload schema, permission, specialist, deterministic summary and existing
business-service implementation per action. Never dispatch arbitrary tool names,
JSON/code/SQL. Tenant/user/role are never accepted as action inputs.

Migration `0008_shallow_stick.sql` adds only `approval_requests`/`approval_status`.
`0009_fixed_agent_brand.sql` adjusts only its risk check to retain the Risk 2
classification of scheduling/assignment and finalization in TOOLS.md. Proposal
record tools themselves remain Risk 1; cards/persistence show the underlying
business action risk (1 or 2). Both require the identical human approval gate.
Requester, specialist, same-tenant run, action/payload/summary, risk, expiry, server
state fingerprint, decision actor/time and safe execution receipt are persisted.
Agent/correlation derive from the linked run. RLS permits only requester/tenant
reads, no authenticated SQL writes. Composite FK bind requester, resolver and run
to organization. No thoughts, API keys or seed data.

Only the requesting human decides their own proposal in v1. Expiry is 30 minutes,
evaluated lazily at decision time. `/api/assistant/proposals` GET/POST authenticate;
POST checks same origin and bounded strict input. Approval re-resolves current
Supabase/business context, then locks/reloads active, undeleted organization and
membership/current role inside the transaction. Stale cached auth cannot authorize
a revoked membership or role.

Scoped proposal locking + business mutation + executed receipt share one outer
transaction. Pending → approved → executed is atomic. Existing service transactions
become savepoints: failure rolls back business writes and persists a failed receipt.
Concurrent double approval/retry returns the same receipt without another execution.
Rejected, expired and failed proposals cannot execute. Replay still checks permission.
Dependent proposals must be requested after the preceding mutation is executed;
there is no automatic multi-action chain or blanket approval of a conversation.

Server SHA-256 fingerprints of locked quote/items or job/report reject changed
records with STALE_PROPOSAL. New quotes revalidate customer/site in the service.
Scheduling rechecks active technician and overlaps, including changes to other jobs.
All service state/tenant/payload/money/final-report invariants remain authoritative.

## UI, observability and limitations

Existing `/assistant`: specialist selector, persisted cards with action/summary/
payload/risk/status, explicit confirmation and Approve/Reject, safe failure or affected
resource link. Vertical mobile cards; no duplicate chat/login infrastructure.
Latest 20 own proposals are shown, not a complete approval inbox.

Runs retain provider/model/routing/fallback/tokens. Proposal tool calls store
`approval_required` and `approval_request_id`. Structured actions, final results and
short status metadata only, never reasoning. Full audit/events, retention, approval
administration/notifications, cancellation/batches and production rate limiting
remain deferred. Human review is essential: valid payloads do not prove commercial
correctness of model-selected values.

Normal tests mock providers/storage. Local integration tests cover concurrency,
approval lifecycle, revoked membership/roles, UUID/RLS isolation, stale records,
conflicting slots and assigned-technician reports. Playwright uses fictional local
proposal fixtures and real approval API, not AI network, to test mobile execution,
rejection and replay. No production migration or remote Supabase access.
