CREATE TABLE "invoice_number_counters" (
	"organization_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"last_number" integer NOT NULL,
	"last_issued_at" timestamp with time zone NOT NULL,
	"last_issue_date" date NOT NULL,
	"last_invoice_id" uuid NOT NULL,
	CONSTRAINT "invoice_number_counters_organization_id_fiscal_year_pk" PRIMARY KEY("organization_id","fiscal_year"),
	CONSTRAINT "invoice_number_counters_values_check" CHECK ("invoice_number_counters"."fiscal_year" between 1000 and 9999 and "invoice_number_counters"."last_number" between 1 and 999999)
);
--> statement-breakpoint
ALTER TABLE "invoice_number_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "issue_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "draft_reference" varchar(50) DEFAULT ('BROUILLON-' || gen_random_uuid()::text) NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_number_counters" ADD CONSTRAINT "invoice_number_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_draft_reference_unique" UNIQUE("organization_id","draft_reference");--> statement-breakpoint
-- Resume each legacy annual series above its highest issued number. Existing gaps stay gaps.
-- Preserve all issued numbers/dates/snapshots, including records without a document snapshot.
INSERT INTO public.invoice_number_counters
  (organization_id, fiscal_year, last_number, last_issued_at, last_issue_date, last_invoice_id)
SELECT organization_id, substring(invoice_number from 5 for 4)::integer,
       max(right(invoice_number, 6)::integer), max(coalesce(issued_at, created_at)),
       max(issue_date), (array_agg(id ORDER BY right(invoice_number, 6)::integer DESC))[1]
FROM public.invoices
WHERE invoice_number ~ '^FAC-[0-9]{4}-[0-9]{6}$'
  AND (issued_at IS NOT NULL OR document_snapshot IS NOT NULL OR status NOT IN ('draft','cancelled'))
GROUP BY organization_id, substring(invoice_number from 5 for 4)::integer;
--> statement-breakpoint
-- Unissued legacy drafts/cancellations get an internal reference, never a fiscal number.
UPDATE public.invoices SET draft_reference = 'BROUILLON-' || id::text,
  invoice_number = NULL, issue_date = NULL
WHERE status IN ('draft','cancelled') AND issued_at IS NULL AND document_snapshot IS NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fiscal_number_check" CHECK (("invoices"."status" <> 'draft' or ("invoices"."invoice_number" is null and "invoices"."issue_date" is null and "invoices"."issued_at" is null)) and ("invoices"."status" in ('draft','cancelled') or ("invoices"."invoice_number" is not null and "invoices"."issue_date" is not null)));
--> statement-breakpoint
REVOKE ALL ON public.invoice_number_counters FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
-- Server-only, invoker privileges. Serializes a tenant even across an annual boundary.
-- Not a public RPC; the service holds membership/source/invoice locks in the same transaction.
CREATE FUNCTION public.allocate_invoice_number(p_org uuid, p_invoice uuid)
RETURNS TABLE(number text, issue_date date, issued_at timestamptz, time_zone text, fiscal_year integer)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_zone text; v_at timestamptz; v_date date; v_year integer; v_number integer;
  v_last_at timestamptz; v_last_date date; v_last_year integer;
BEGIN
  PERFORM 1 FROM public.invoices i WHERE i.id = p_invoice AND i.organization_id = p_org
    AND i.status = 'draft' AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft invoice unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invoice-fiscal:' || p_org::text, 0));
  SELECT o.timezone INTO v_zone FROM public.organizations o
    WHERE o.id = p_org AND o.status = 'active' AND o.deleted_at IS NULL;
  IF v_zone IS NULL THEN RAISE EXCEPTION 'Active organization unavailable' USING ERRCODE = '23514'; END IF;
  -- Clock sampled AFTER waiting, not transaction-start now(); milliseconds match JS Date exactly.
  v_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  v_date := (v_at AT TIME ZONE v_zone)::date;
  v_year := extract(year FROM v_date)::integer;
  SELECT max(c.last_issued_at), max(c.last_issue_date), max(c.fiscal_year)
    INTO v_last_at, v_last_date, v_last_year FROM public.invoice_number_counters c WHERE c.organization_id = p_org;
  IF v_at < v_last_at OR v_date < v_last_date OR v_year < v_last_year THEN
    RAISE EXCEPTION 'Issuance chronology would move backwards; reconcile clock/timezone/legacy history' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.invoice_number_counters AS c
    (organization_id, fiscal_year, last_number, last_issued_at, last_issue_date, last_invoice_id)
    VALUES (p_org, v_year, 1, v_at, v_date, p_invoice)
    ON CONFLICT (organization_id, fiscal_year) DO UPDATE SET last_number = c.last_number + 1,
      last_issued_at = v_at, last_issue_date = v_date, last_invoice_id = p_invoice
    RETURNING last_number INTO v_number;
  RETURN QUERY SELECT 'FAC-' || v_year::text || '-' || pg_catalog.lpad(v_number::text, 6, '0'), v_date, v_at, v_zone, v_year;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.allocate_invoice_number(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
-- A monotonic high-water mark cannot be rolled back administratively or deleted while its tenant exists.
CREATE FUNCTION public.protect_invoice_counter() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
      RAISE EXCEPTION 'Fiscal counter cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.fiscal_year <> OLD.fiscal_year
     OR NEW.last_number <> OLD.last_number + 1 OR NEW.last_issued_at < OLD.last_issued_at
     OR NEW.last_issue_date < OLD.last_issue_date THEN
    RAISE EXCEPTION 'Fiscal counter must advance continuously' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_invoice_counter() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER invoice_counter_monotonic BEFORE UPDATE OR DELETE ON public.invoice_number_counters
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_counter();
--> statement-breakpoint
-- New records start unissued; imports require a future explicit controlled workflow.
CREATE FUNCTION public.protect_new_invoice() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status NOT IN ('draft','cancelled') OR NEW.invoice_number IS NOT NULL OR NEW.issue_date IS NOT NULL
     OR NEW.issued_at IS NOT NULL OR NEW.document_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'New invoice must be an unissued draft' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_new_invoice() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER invoice_initial_draft BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.protect_new_invoice();
--> statement-breakpoint
-- Keep the previously shipped snapshot/commercial guard, add allocation and legacy number protection.
CREATE OR REPLACE FUNCTION public.protect_invoice_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.draft_reference IS DISTINCT FROM OLD.draft_reference THEN
    RAISE EXCEPTION 'Draft reference is immutable' USING ERRCODE = '23514'; END IF;
  IF OLD.invoice_number IS NOT NULL AND ROW(NEW.invoice_number, NEW.issue_date, NEW.issued_at, NEW.organization_id)
      IS DISTINCT FROM ROW(OLD.invoice_number, OLD.issue_date, OLD.issued_at, OLD.organization_id) THEN
    RAISE EXCEPTION 'Issued number and dates are immutable, including legacy' USING ERRCODE = '23514'; END IF;
  IF OLD.invoice_number IS NULL AND NEW.invoice_number IS NOT NULL AND NOT (OLD.status = 'draft' AND NEW.status = 'issued') THEN
    RAISE EXCEPTION 'Fiscal number is assigned only at issuance' USING ERRCODE = '23514'; END IF;
  IF (OLD.document_snapshot IS NOT NULL OR OLD.status <> 'draft') AND
     ROW(NEW.transaction_type, NEW.operation_category, NEW.fiscal_territory, NEW.vat_treatment, NEW.vat_reason)
       IS DISTINCT FROM ROW(OLD.transaction_type, OLD.operation_category, OLD.fiscal_territory, OLD.vat_treatment, OLD.vat_reason)
  THEN RAISE EXCEPTION 'Issued invoice classification is immutable' USING ERRCODE = '23514'; END IF;
  IF OLD.document_snapshot IS NOT NULL THEN
    IF NEW.document_snapshot IS DISTINCT FROM OLD.document_snapshot
       OR ROW(NEW.organization_id, NEW.invoice_number, NEW.customer_id,
              NEW.quote_id, NEW.job_id, NEW.issue_date, NEW.due_date,
              NEW.issued_at, NEW.subtotal, NEW.tax_amount, NEW.total, NEW.notes)
          IS DISTINCT FROM
          ROW(OLD.organization_id, OLD.invoice_number, OLD.customer_id,
              OLD.quote_id, OLD.job_id, OLD.issue_date, OLD.due_date,
              OLD.issued_at, OLD.subtotal, OLD.tax_amount, OLD.total, OLD.notes)
    THEN RAISE EXCEPTION 'Issued invoice document is immutable' USING ERRCODE = '23514'; END IF;
  ELSIF OLD.status <> 'draft' AND NEW.document_snapshot IS NOT NULL THEN
    RAISE EXCEPTION 'Historical snapshot cannot be reconstructed' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    IF NEW.document_snapshot IS NULL OR NEW.issued_at IS NULL THEN
      RAISE EXCEPTION 'Invoice issue requires an atomic snapshot' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.invoice_number_counters c WHERE c.organization_id = NEW.organization_id
      AND c.last_invoice_id = NEW.id AND NEW.invoice_number = 'FAC-' || c.fiscal_year::text || '-' || pg_catalog.lpad(c.last_number::text, 6, '0')
      AND NEW.issue_date = c.last_issue_date AND NEW.issued_at = c.last_issued_at) THEN
      RAISE EXCEPTION 'Fiscal allocation does not match issuance' USING ERRCODE = '23514'; END IF;
    IF (NEW.document_snapshot->>'version' = '3'
        AND (NEW.document_snapshot->'issuance'->>'issuedAt')::timestamptz = NEW.issued_at
        AND NEW.document_snapshot->>'capturedAt' = NEW.document_snapshot->'issuance'->>'issuedAt'
        AND NEW.issue_date = (NEW.issued_at AT TIME ZONE (NEW.document_snapshot->'issuance'->>'timeZone'))::date
        AND NEW.document_snapshot->'issuance'->>'timeZone' = (SELECT timezone FROM public.organizations WHERE id = NEW.organization_id)
        AND (NEW.document_snapshot->'issuance'->>'fiscalYear')::integer = extract(year FROM NEW.issue_date)::integer
        AND NEW.document_snapshot->'classification'->>'transactionType' = NEW.transaction_type::text
        AND NEW.document_snapshot->'classification'->>'operationCategory' = NEW.operation_category::text
        AND NEW.document_snapshot->'classification'->>'fiscalTerritory' = NEW.fiscal_territory::text
        AND NEW.document_snapshot->'classification'->>'vatTreatment' = NEW.vat_treatment::text
        AND (NEW.document_snapshot->'classification'->>'vatReason') IS NOT DISTINCT FROM NEW.vat_reason
        AND NEW.document_snapshot->>'organizationId' = NEW.organization_id::text
        AND NEW.document_snapshot->>'invoiceId' = NEW.id::text
        AND NEW.document_snapshot->'invoice'->>'number' = NEW.invoice_number
        AND NEW.document_snapshot->'invoice'->>'issueDate' = NEW.issue_date::text
        AND NEW.document_snapshot->'invoice'->>'dueDate' = NEW.due_date::text
        AND (NEW.document_snapshot->'totals'->>'subtotal')::numeric = NEW.subtotal
        AND (NEW.document_snapshot->'totals'->>'taxAmount')::numeric = NEW.tax_amount
        AND (NEW.document_snapshot->'totals'->>'total')::numeric = NEW.total) IS NOT TRUE
    THEN RAISE EXCEPTION 'Invoice snapshot does not match invoice' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
