# Manual payment tracking

## Scope

Payment tracking records **funds already received**, in EUR, allocated to one
issued invoice. It does not collect funds, initiate transfers, reconcile a bank
account or verify a receipt independently. No Qonto, Stripe, direct debit, reminder,
Billing Agent or AI mutation tool is introduced.

`0011_salty_namorita.sql` adds only `payments`, payment_method/payment_status enums,
invoice amount_paid/amount_due/paid_at snapshots and a parent composite unique key.
Existing invoices receive amount_due = total without invented receipts. Historical
paid/partially_paid invoices cause migration to refuse until explicitly reconciled.
Old migrations are untouched. The new parent key precedes its payment foreign key.

## Data and workflow

PaymentService → PaymentStore/PaymentRepository → PostgreSQL. Invoice/customer/org
are linked by a composite FK; creator/corrector must belong to the same tenant.
Customer is derived from the locked invoice, never from external input. In v1
invoice_id is mandatory; unallocated credits, bank_transaction_id and direct_debit
are deliberately deferred from the broader domain model.

An input contains a positive decimal amount, received-at UTC instant (not future),
method bank_transfer/card/cash/cheque/other, optional bounded reference and UUID
idempotency key. A receipt defaults to completed. It has no editing/deletion API.
Correction is an explicit completed → cancelled transition with human actor,
timestamp and mandatory reason, **not a refund or cancellation of a bank transfer**.
Cancelled receipts remain visible but no longer contribute to the balance.

Record/correction re-read and shared-lock active, non-deleted organization and
membership/role, then lock the tenant-scoped invoice FOR UPDATE. Completed receipt
SUM uses PostgreSQL NUMERIC; application arithmetic uses BigInt cents. Reject any
new receipt exceeding total minus issued credit notes and completed payments. Receipt and invoice snapshots
commit together or roll back together. This serializes concurrent payments on the
same invoice, including across processes. Since M4, total − amount_credited −
amount_paid = amount_due − customer_credit, with non-negative/exclusive debt and
credit, is also checked by PostgreSQL. See [credit notes](credit-notes.md).

The organization/key unique constraint prevents duplicate receipts. A replay with
the same invoice/amount/method/instant/reference returns the original record, even
after full settlement or correction; it cannot resurrect a cancelled receipt.
Different payload/key reuse conflicts. Concurrent reuse on another invoice fails
safely without inserting a second receipt. References are not assumed globally unique.

Positive received balance below the net corrected debt derives partially_paid; full settlement
derives paid with paid_at = latest completed receipt date. Correction clears paid_at
when no longer settled. If all receipts are cancelled, the invoice returns to issued
(or preserves sent/overdue if still in that state). No historical pre-payment status
is reconstructed and no overdue cron exists. Zero-total invoices remain issued and
cannot accept positive receipts; no invented zero payment is created. Draft,
cancelled and written_off invoices cannot receive receipts. Issued items stay immutable.

## Security and UI

OWNER/ADMIN/MANAGER/ACCOUNTANT have payments.read/write, READ_ONLY reads and
TECHNICIAN has no access. Service authorization remains mandatory. RLS SELECT
requires active tenant membership and a readable parent invoice, inheriting its role
restriction. No authenticated SQL write policy exists; anonymous reads are denied.
M5A SQL guards now reject payment history rewrites/deletion and unsynchronized
ledger commits. Receipt/cancellation and derived status events are transactional,
with trusted active actor checks; see [financial audit](financial-audit.md).
An owner/superuser can still disable protections: no WORM/retention claim.

Existing `/invoices/[id]` provides received/remaining amounts, paginated receipt cards,
manual entry and correction with reason. French phone-friendly forms; no new primary
navigation or bank credentials. Every action re-authenticates, validates strict Zod,
checks current membership/permissions and calls the service. AI approval allowlist
is unchanged and contains no invoice/payment action.

## Validation and deferred work

Normal tests cover exact balances, statuses, schemas and permissions without runtime.
Local-only integrations exercise actual Supabase RLS, UUID attacks, anonymous/admin
controls, composite FK rejection, concurrent receipts, replay/mismatched keys, revoked
membership/role, correction, overpayment and rollback of receipt + balance. E2E extends
the mobile invoice flow with partial/final receipts, overpayment rejection and correction.
Fixtures are fictional; local-only owner cleanup is isolated in tests, with no runtime bypass.

M4 adds invoice-attached customer credit from issued corrections, not an unallocated
receipt or refund. Existing receipt history is unchanged and receipt cancellation
recalculates the economic balance with credits. Current invoice copies show the dated
correction/debt/credit section separately; M5B preserved originals omit dynamic payments.

No fiscal/production compliance claim, reimbursement workflow, unallocated credit,
universal audit, automated overdue transition or banking verification.
M5B provides bounded financial archives and verification; production retention/storage,
backups and real restore remain separate work. See [financial retention](financial-retention.md).
