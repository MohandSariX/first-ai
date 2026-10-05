# Quotes, interventions and field reports — first milestone

Only `quotes`, `quote_items`, `jobs` and `job_reports` are added by migration
`0006_amused_exiles`. Migrations 0000–0005 remain unchanged. Drizzle is the only
application migration history; validation and fixtures target local Supabase only.

## Boundaries and temporary omissions

Opportunities, contracts, pest types, employees and documents do not exist yet.
Their future foreign-key columns are intentionally omitted: `opportunity_id`,
`contract_id`, `pest_type_id`, `assigned_employee_id` and
`customer_signature_document_id`. `jobs.assigned_user_id` instead references an
active First AI TECHNICIAN user, and `job_reports.technician_id` references the
First AI user who authored the report. These are explicitly user identities, not
employee identities; a future employee phase needs an additive, reviewed mapping.
There are no signatures, uploads, stock usage, invoices, payments or specialist agents.

`quote_items.organization_id` is added to support database-level composite quote
and service foreign keys. A quote/site and job/site must also agree on customer,
not just tenant. Jobs linked to quotes must agree on tenant, customer and site.
Creators, optional agent creators, technician assignments and report authors also
have tenant-bound foreign keys. Parent references restrict deletion; strictly
dependent quote items alone can cascade on controlled quote deletion.

## Exact quote arithmetic

External money values are decimal strings; PostgreSQL uses NUMERIC(14,2).
Quantities have up to three decimals and tax percentages up to three decimals.
The calculation module uses BigInt fixed-point arithmetic, never floating-point
money calculations. Each line HT amount, estimated cost and VAT is rounded half up
to cents. `cost_estimate` is **per unit** and is multiplied by quantity. VAT is
calculated from the rounded line HT using that line's explicit tax percentage.
There is no hardcoded or implied default VAT rate.

Subtotal and VAT are sums of rounded lines. Total = subtotal + VAT.
Estimated margin = subtotal HT − estimated cost, excluding VAT.
The persisted percentage is margin / subtotal HT × 100, rounded to three decimals
(a revenue-based margin percentage, not cost markup). It is null for zero revenue.
Negative margins are allowed and displayed. Excessive totals are rejected and the
whole mutation rolls back. Maximum 200 items per quote.

Stored totals are snapshots updated transactionally whenever an item is changed.
`quotes.calculateTotals` is a pure Risk 0 calculation; it never writes snapshots.
Financial/tax recommendations and intelligent pricing are not implemented.

## Numbering and acceptance

Quote numbers use `DEV-YYYY-000001`, scoped by organization and organization-local
calendar year. A transaction locks the organization's row before allocating the
next number. A unique organization/number constraint provides a final safeguard.
Soft-deleted numbers remain reserved; there is no fifth sequence table. This
serializes allocation across application instances. Current capacity is 999,999
quotes per organization/year; there is no invoice numbering implementation.

Item mutations lock the quote row and only accept drafts. A non-empty, unexpired
draft can become ready. Ready/sent/viewed quotes can be manually accepted or
rejected; accepted and other terminal states cannot casually return to draft.
This phase has no email sending or UI action for marking a quote sent.

`acceptQuoteAndCreateJob` explicitly selects a catalog service appearing on a
quote item. It creates **one draft job for the whole quote**, using that service
as its primary operational classification; the job inherits all quote HT revenue
and estimated cost. It does not create one job per line. The confirmation UI
explains this choice. Acceptance, timestamp and job insertion are one transaction.
Concurrent retries return the same job; selecting a different service on retry
is a conflict. A tenant/quote uniqueness constraint prevents duplicate jobs.
Splitting a quote into multiple visits is a later workflow, not inferred here.

## Field workflow

Draft → scheduled → in_progress → completed / follow_up_required.
Confirmed/en_route enum paths are supported by transitions but have no separate
confirmation/travel workflow yet. Administrators/managers can schedule, reschedule,
assign and cancel. An active TECHNICIAN user may be assigned. Scheduling and
assignment lock that technician's user row to serialize overlap checks; adjacent
slots are allowed and cancelled/completed jobs do not block new slots.
Certification, employee availability, absences and travel optimization are not
claimed: those domains do not exist yet.

Stored timestamps are UTC. Calendar-day searches and today's counts use the
organization's timezone, including DST. Date/time entry is explicitly in the
device timezone, converted to an ISO instant before service validation.

A report is drafted after starting a job. This first workflow has one report per
job, with completion represented by `completed_at`. Technicians may edit only
their own draft report on their assigned job; managers may author/edit operational
reports. Finalization requires observations and treatment performed. A finalized
report is immutable in this milestone and is required before completing a job.
Follow-up is only a flag/date recommendation, never an automatic new job.
Actual cost/margin stay unknown (null); product/labor cost accounting is not invented.

## Authorization, RLS and tools

OWNER/ADMIN/MANAGER have operational read/write. TECHNICIAN has assigned-job reads,
start/complete (`jobs.execute`) and own-report writes, but no quote access or planning
administration. ACCOUNTANT reads quotes/jobs without mutations or report access.
READ_ONLY reads without mutations. Services enforce these rules independently of UI.

Every repository API requires organization scope, including privileged Drizzle
queries. Technicians' job searches add assigned-user scope; direct UUID requests
also check assignment. RLS on all four tables rejects cross-tenant/anonymous reads,
restricts technicians to assigned jobs and makes quote-item access inherit readable
quotes. No authenticated SQL write policies are granted: writes pass through the
authenticated server action, service permissions, validation and scoped transaction.

Operational tools reuse services: quotes.get/search/createDraft/addItem/calculateTotals;
jobs.get/search/getToday/createDraft; jobReports.get/createDraft. Draft writes are
Risk 1; reads/calculation are Risk 0. Structured errors never contain raw SQL.
Future persisted audit/event integration is not faked: creator IDs, state timestamps
and existing AgentToolCall logs are present, but a complete human mutation audit
history needs the later audit/domain-event phase.

Director receives only six additional reads: quotes.get/search, jobs.get/search/getToday
and jobReports.get. Its single allowlist and permission filters apply unchanged to
both Ollama and OpenAI, with the same tenant context, budgets and tool-call logs.
Neither provider receives creation, acceptance, scheduling or completion tools.

## UI and validation

Authenticated French routes: `/quotes`, `/quotes/[id]`, `/jobs`, `/jobs/[id]`.
Lists support bounded search/status pagination; interventions also support local
calendar-day filtering. Quote creation is customer/site selection, then item entry.
Details expose permission-checked server actions and field-level Zod validation.
Cards and vertically stacked report forms work without horizontal scrolling.
The bottom navigation keeps at most five destinations; Devis, Prestations and AI
settings remain in the accessible mobile secondary menu. Dashboard adds only real
pending-quote and today's-job counts. Initial creation pickers show bounded sets
of 100 customers/sites/services/technicians; no unbounded dropdown queries.

`pnpm test` requires no local runtime. `pnpm test:integration` additionally runs
operational services against local PostgreSQL and actual authenticated Supabase
RLS tests. They verify sequential/concurrent numbering, known-ID isolation,
cross-tenant foreign keys, acceptance idempotence, rollback, report workflow and
scheduling conflicts. `pnpm test:e2e` covers a fictional quote → job → mobile report
flow and cleans records in dependency order. Live AI is not required; the existing
loopback-only `pnpm test:ollama` stays a separate small smoke test.
