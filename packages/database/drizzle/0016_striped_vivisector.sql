ALTER TABLE "organizations" ADD COLUMN "invoice_terms" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "unit" varchar(24);--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "kind" varchar(16) DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "business_details" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_adjustments_check" CHECK ("invoice_items"."discount_amount" >= 0 and "invoice_items"."discount_amount" <= round("invoice_items"."quantity" * "invoice_items"."unit_price", 2) and "invoice_items"."kind" in ('item','charge') and ("invoice_items"."kind" <> 'charge' or "invoice_items"."quantity" = 1) and ("invoice_items"."unit" is null or length(trim("invoice_items"."unit")) > 0));
--> statement-breakpoint
-- M3 upgrades only new issuance to v4; existing v1/v2/v3 bodies remain immutable.
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
    IF (NEW.document_snapshot->>'version' = '4'
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
--> statement-breakpoint
CREATE FUNCTION public.protect_invoice_mentions() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.status <> 'draft' OR OLD.document_snapshot IS NOT NULL OR OLD.issued_at IS NOT NULL)
     AND NEW.business_details IS DISTINCT FROM OLD.business_details THEN
    RAISE EXCEPTION 'Issued business details are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    IF NEW.business_details IS NULL OR NEW.document_snapshot->'businessDetails' IS DISTINCT FROM NEW.business_details
       OR NEW.document_snapshot->'paymentTerms'->>'dueDate' IS DISTINCT FROM NEW.due_date::text
       OR nullif(trim(NEW.document_snapshot->'paymentTerms'->>'paymentTermsText'), '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = NEW.id AND organization_id = NEW.organization_id)
       OR EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = NEW.id AND organization_id = NEW.organization_id AND (unit IS NULL OR trim(unit) = '')) THEN
      RAISE EXCEPTION 'Complete atomic M3 snapshot required' USING ERRCODE = '23514';
    END IF;
    IF coalesce(NEW.business_details->>'executionDate', NEW.business_details->>'periodEnd') IS NULL
       OR coalesce(NEW.business_details->>'executionDate', NEW.business_details->>'periodEnd')::date > NEW.issue_date THEN
      RAISE EXCEPTION 'Confirmed execution date required' USING ERRCODE = '23514';
    END IF;
    IF NEW.transaction_type = 'B2B' THEN
      IF nullif(trim(NEW.document_snapshot->'paymentTerms'->>'earlyDiscountText'), '') IS NULL
         OR nullif(trim(NEW.document_snapshot->'paymentTerms'->>'latePenaltyText'), '') IS NULL
         OR NEW.document_snapshot->'paymentTerms'->>'recoveryIndemnityAmount' IS DISTINCT FROM '40.00' THEN
        RAISE EXCEPTION 'Professional terms required' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.document_snapshot->'paymentTerms'->>'latePenaltyText' IS NOT NULL
       OR NEW.document_snapshot->'paymentTerms'->>'recoveryIndemnityAmount' IS NOT NULL THEN
      RAISE EXCEPTION 'Private professional terms forbidden' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_invoice_mentions() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER invoice_mentions_immutable BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_mentions();
