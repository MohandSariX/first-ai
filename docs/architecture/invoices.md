# Invoice foundation

Document/PDF delivery now builds on this foundation:
[immutable invoice documents](invoice-documents.md). Issue captures a versioned
snapshot atomically; PDF remains a technical, not fiscally certified, document.

## Scope and data

`invoices` and `invoice_items` are the only new tables in
`0010_confused_photon.sql`. Old migrations remain unchanged. The two additive
customer/tenant unique keys on quotes/jobs support composite invoice foreign keys.
UUIDs, UTC timestamps, date-only issue/due dates, NUMERIC and decimal-string DTOs
follow existing conventions. Invoice items carry organization_id for composite
parent/service integrity. Parent references restrict deletion; dependent items
alone cascade on controlled fixture/administrative invoice deletion.

Contract links, delivery/sent_at, accounting references and credit notes remain
deferred. Technical PDFs now use [immutable documents](invoice-documents.md).
Payment snapshots and manual receipts
are now implemented separately in [payment tracking](payments.md). Item totals are derived,
not redundantly stored; invoice totals are transactional snapshots.

## Numbering and calculations

`FAC-YYYY-000001` is allocated server-side in a transaction under an organization
row lock, with UNIQUE(organization_id, invoice_number). Year comes from the explicit
issue date. Numbers are reserved when creating drafts, including cancelled and
soft-deleted records; capacity is 999,999 per tenant/year. This is the existing quote
numbering pattern, not a claim of production-ready fiscal numbering or legal compliance.
Before production billing, review draft reservation, issue-date chronology, mandatory
document details and correction/credit-note rules. No physical invoice deletion API exists.

The same BigInt fixed-point engine used by quotes computes HT rounded half-up per
line, then VAT rounded per line using its explicit rate. Totals sum those rounded
values; TTC = HT + VAT. Up to 200 lines, quantities/rates with three decimals, prices
with two. No floating-point authoritative arithmetic or AI calculation. Item mutation
locks the draft and updates totals in the same transaction; overflow rolls back both.

## Lifecycle and source links

Domain enum vocabulary remains draft/issued/sent/partially_paid/paid/overdue/cancelled/
written_off. Only draft → issued and draft → cancelled are exposed. Issue requires
at least one valid line, a current non-deleted customer and valid source links;
it recomputes totals and records issued_at. Concurrent issue retries return the same
issued record. Issued lines are immutable; issued cancellation is deliberately unavailable
without the future correction workflow. No automatic overdue transition. Payment
states are derived transactionally by PaymentService, not arbitrary invoice updates.

Creation is explicit and manual. Optional quote/job links must agree with the customer
and tenant, and with each other when supplied together. Quotes must be accepted;
jobs must be completed. These source states are checked again at issue time.
Composite foreign keys also enforce customer/tenant agreement for each source.
No automatic item copying or createFromQuote/createFromJob operation is exposed:
job price has no item VAT breakdown, and partial/multiple billing cardinality is not
defined yet. Therefore no guessed UNIQUE(source) constraint is added. Manual links
are references, not a promise that the source has been billed exactly once.

## Security and interfaces

InvoiceService → InvoiceStore/InvoiceRepository → PostgreSQL, always organization-scoped.
OWNER/ADMIN/MANAGER/ACCOUNTANT have invoices.read/write/issue; READ_ONLY reads;
TECHNICIAN has no invoice access. Existing CRM/quote permissions are unchanged.
RLS SELECT follows those read roles and active membership/organization resolution.
Items inherit invoice readability. Anonymous access and authenticated SQL mutations
are denied; privileged Drizzle operations still explicitly scope tenant and item IDs.

Authenticated `/invoices` and `/invoices/[id]` reuse server-authenticated actions,
strict Zod validation, service authorization, pagination and safe errors. French mobile
cards/forms support creation, line editing/removal, totals, confirmation-based issue
and draft cancellation. Factures stays in the secondary mobile menu. Customer picker
is bounded to 100; source links/service references are supported by services, not new
large pickers. No dashboard metric is added.

`invoices.get/search` are prepared Risk 0 tools with service authorization. They are
**not registered with Director or specialists** in this milestone. No invoice mutation
tool or approval action exists; the specialist approval registry/policy remains unchanged.

## Validation and limitations

Unit tests cover exact arithmetic/rounding/VAT, statuses, numbering, roles and strict
bounded schemas. Local-only integration fixtures verify actual authenticated RLS,
known IDs, anonymous/service-role controls, revoked membership, tenant FKs, concurrent
numbering/issue, rollback and source state revalidation. Playwright covers mobile manual
draft → line edit → issue and cleans invoices before their parent resources.
Normal tests require no Supabase/provider. Production audit, fiscal validation,
banking/reconciliation, email, exports and Billing Agent remain separate milestones.
