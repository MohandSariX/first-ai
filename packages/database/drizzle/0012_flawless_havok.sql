ALTER TABLE "invoices" ADD COLUMN "document_snapshot" jsonb;
--> statement-breakpoint
-- Historical issued invoices remain NULL: reconstructing a historical document
-- from today's CRM would fabricate evidence. New issue transitions must capture it.
CREATE FUNCTION public.protect_invoice_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
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
      RAISE EXCEPTION 'Invoice issue requires an atomic snapshot' USING ERRCODE = '23514';
    END IF;
    IF (NEW.document_snapshot->>'version' = '1'
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
REVOKE ALL ON FUNCTION public.protect_invoice_document() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER invoices_document_immutable BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_document();
