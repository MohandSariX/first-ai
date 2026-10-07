-- Additional integrity guards discovered during M5A review after 0019 was applied.
-- Do not rewrite applied history. No data backfill or destructive operations.
CREATE FUNCTION public.validate_financial_event_resource() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE valid boolean;
BEGIN
  CASE NEW.entity_type
    WHEN 'invoice' THEN SELECT EXISTS(SELECT 1 FROM public.invoices WHERE id = NEW.entity_id AND organization_id = NEW.organization_id) INTO valid;
    WHEN 'credit_note' THEN SELECT EXISTS(SELECT 1 FROM public.credit_notes WHERE id = NEW.entity_id AND organization_id = NEW.organization_id) INTO valid;
    WHEN 'payment' THEN SELECT EXISTS(SELECT 1 FROM public.payments WHERE id = NEW.entity_id AND organization_id = NEW.organization_id) INTO valid;
    WHEN 'customer' THEN SELECT EXISTS(SELECT 1 FROM public.customers WHERE id = NEW.entity_id AND organization_id = NEW.organization_id) INTO valid;
    WHEN 'organization' THEN valid := NEW.entity_id = NEW.organization_id;
    ELSE valid := false;
  END CASE;
  IF NOT valid THEN RAISE EXCEPTION 'Financial audit resource must belong to actor tenant' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER zz_financial_audit_resource BEFORE INSERT ON public.financial_audit_events FOR EACH ROW EXECUTE FUNCTION public.validate_financial_event_resource();
--> statement-breakpoint
-- Deferred verification allows receipt/correction then balance synchronization in the
-- SAME transaction, but prevents a privileged insert from committing a stale balance.
CREATE FUNCTION public.verify_financial_ledger_commit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent public.invoices%ROWTYPE; parent_id uuid; received numeric; credited numeric; latest_payment timestamptz; expected_status text;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN parent_id := NEW.invoice_id; ELSE parent_id := NEW.original_invoice_id; END IF;
  SELECT * INTO parent FROM public.invoices WHERE id = parent_id AND organization_id = NEW.organization_id FOR UPDATE;
  IF parent.id IS NULL OR parent.issued_at IS NULL THEN
    RAISE EXCEPTION 'Issued invoice required for financial ledger' USING ERRCODE = '23514'; END IF;
  SELECT coalesce(sum(amount),0), max(paid_at) INTO received,latest_payment FROM public.payments WHERE invoice_id = parent_id AND organization_id = NEW.organization_id AND status = 'completed';
  SELECT coalesce(sum(total),0) INTO credited FROM public.credit_notes WHERE original_invoice_id = parent_id AND organization_id = NEW.organization_id AND status = 'issued';
  expected_status := CASE WHEN received > 0 THEN CASE WHEN received >= parent.total - credited THEN 'paid' ELSE 'partially_paid' END
    WHEN parent.status IN ('paid','partially_paid') THEN 'issued' ELSE parent.status::text END;
  IF parent.amount_paid <> received OR parent.amount_credited <> credited
     OR parent.amount_due <> greatest(parent.total-credited-received,0)
     OR parent.customer_credit <> greatest(received+credited-parent.total,0)
     OR parent.status::text <> expected_status
     OR parent.paid_at IS DISTINCT FROM (CASE WHEN expected_status = 'paid' THEN latest_payment ELSE NULL END) THEN
    RAISE EXCEPTION 'Financial mutation must commit with its derived balance' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER payment_balance_atomic AFTER INSERT OR UPDATE ON public.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.verify_financial_ledger_commit();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER credit_balance_atomic AFTER UPDATE ON public.credit_notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'issued') EXECUTE FUNCTION public.verify_financial_ledger_commit();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.validate_financial_event_resource(), public.verify_financial_ledger_commit() FROM PUBLIC, anon, authenticated, service_role;
