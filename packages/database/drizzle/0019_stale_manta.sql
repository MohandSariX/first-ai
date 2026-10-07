CREATE TABLE "financial_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_type" varchar(16) DEFAULT 'user' NOT NULL,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_audit_event_check" CHECK ("financial_audit_events"."event_type" in ('invoice.issued','invoice.cancelled','invoice.status_changed','invoice.metadata_changed','credit_note.issued','credit_note.cancelled','payment.recorded','payment.cancelled','billing.seller_changed','billing.customer_changed','billing.terms_changed')),
	CONSTRAINT "financial_audit_entity_check" CHECK ("financial_audit_events"."entity_type" in ('invoice','credit_note','payment','organization','customer') and "financial_audit_events"."actor_type" = 'user'),
	CONSTRAINT "financial_audit_metadata_check" CHECK (jsonb_typeof("financial_audit_events"."metadata") = 'object' and octet_length("financial_audit_events"."metadata"::text) <= 2048)
);
--> statement-breakpoint
ALTER TABLE "financial_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_audit_events" ADD CONSTRAINT "financial_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_events" ADD CONSTRAINT "financial_audit_actor_org_fk" FOREIGN KEY ("actor_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_audit_org_time_idx" ON "financial_audit_events" USING btree ("organization_id","occurred_at","id");--> statement-breakpoint
CREATE POLICY "financial_audit_select_own" ON "financial_audit_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT')));
--> statement-breakpoint
-- Coverage starts here: no synthetic event backfill. No runtime bypass or purge function.
CREATE FUNCTION public.guard_financial_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE member_role text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Financial audit is append-only' USING ERRCODE = '23514'; END IF;
  IF NEW.organization_id::text IS DISTINCT FROM nullif(current_setting('first_ai.actor_org', true), '')
     OR NEW.actor_user_id::text IS DISTINCT FROM nullif(current_setting('first_ai.actor_user', true), '')
     OR NEW.correlation_id::text IS DISTINCT FROM nullif(current_setting('first_ai.correlation', true), '') THEN
    RAISE EXCEPTION 'Trusted financial actor required' USING ERRCODE = '23514';
  END IF;
  SELECT u.role::text INTO member_role FROM public.users u JOIN public.organizations o ON o.id = u.organization_id
  WHERE u.id = NEW.actor_user_id AND u.organization_id = NEW.organization_id
    AND u.auth_user_id::text = current_setting('first_ai.actor_auth', true)
    AND u.status = 'active' AND u.deleted_at IS NULL AND o.status = 'active' AND o.deleted_at IS NULL
  FOR SHARE OF u, o;
  IF member_role IS NULL OR member_role NOT IN ('OWNER','ADMIN','MANAGER','ACCOUNTANT')
     OR (NEW.event_type IN ('billing.seller_changed','billing.terms_changed','invoice.metadata_changed') AND member_role NOT IN ('OWNER','ADMIN')) THEN
    RAISE EXCEPTION 'Active authorized financial actor required' USING ERRCODE = '23514'; END IF;
  IF (NEW.event_type LIKE 'invoice.%' AND NEW.entity_type <> 'invoice')
     OR (NEW.event_type LIKE 'credit_note.%' AND NEW.entity_type <> 'credit_note')
     OR (NEW.event_type LIKE 'payment.%' AND NEW.entity_type <> 'payment')
     OR (NEW.event_type IN ('billing.seller_changed','billing.terms_changed') AND (NEW.entity_type <> 'organization' OR NEW.entity_id <> NEW.organization_id))
     OR (NEW.event_type = 'billing.customer_changed' AND (NEW.entity_type <> 'customer' OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.entity_id AND organization_id = NEW.organization_id))) THEN
    RAISE EXCEPTION 'Financial event entity mismatch' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.metadata) e WHERE e.key NOT IN ('number','invoiceId','from','to','amount','amountPaid','amountDue','amountCredited','customerCredit','fields')
      OR (e.key <> 'fields' AND (jsonb_typeof(e.value) NOT IN ('string','null') OR length(e.value::text) > 100))) THEN
    RAISE EXCEPTION 'Unbounded financial event metadata' USING ERRCODE = '23514'; END IF;
  IF NEW.metadata ? 'fields' THEN
    IF jsonb_typeof(NEW.metadata->'fields') <> 'array' OR jsonb_array_length(NEW.metadata->'fields') > 32 THEN
      RAISE EXCEPTION 'Invalid financial changed fields' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.metadata->'fields') f WHERE jsonb_typeof(f) <> 'string' OR (f #>> '{}') !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$') THEN
      RAISE EXCEPTION 'Invalid financial field name' USING ERRCODE = '23514'; END IF;
  END IF;
  NEW.occurred_at := clock_timestamp();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_audit_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.financial_audit_events FOR EACH ROW EXECUTE FUNCTION public.guard_financial_audit();
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.financial_audit_events FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION public.protect_financial_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN RAISE EXCEPTION 'Financial runtime truncation prohibited' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'payments' THEN
    RAISE EXCEPTION 'Financial history cannot be deleted' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF OLD.issued_at IS NULL AND OLD.invoice_number IS NULL AND OLD.document_snapshot IS NULL THEN RETURN OLD; END IF;
  ELSIF TG_TABLE_NAME = 'credit_notes' THEN
    IF OLD.status <> 'issued' THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Financial history cannot be deleted' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER invoices_no_issued_delete BEFORE DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER credit_notes_no_issued_delete BEFORE DELETE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE FUNCTION public.protect_invoice_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent_status text; parent_issued timestamptz; parent_id uuid; org uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.id,NEW.organization_id,NEW.invoice_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.invoice_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Invoice item identity is immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN parent_id := OLD.invoice_id; org := OLD.organization_id; ELSE parent_id := NEW.invoice_id; org := NEW.organization_id; END IF;
  SELECT status::text, issued_at INTO parent_status, parent_issued FROM public.invoices WHERE id = parent_id AND organization_id = org FOR UPDATE;
  IF parent_status IS NOT NULL AND (parent_status <> 'draft' OR parent_issued IS NOT NULL) THEN
    RAISE EXCEPTION 'Issued invoice items are immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_item();
--> statement-breakpoint
CREATE FUNCTION public.harden_invoice_financial_state() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE received numeric; credited numeric; last_payment timestamptz; expected_status text;
BEGIN
  IF OLD.issued_at IS NOT NULL OR OLD.invoice_number IS NOT NULL OR OLD.document_snapshot IS NOT NULL THEN
    IF (to_jsonb(NEW) - ARRAY['status','amount_paid','amount_due','amount_credited','customer_credit','paid_at','updated_at','internal_notes'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','amount_paid','amount_due','amount_credited','customer_credit','paid_at','updated_at','internal_notes']) THEN
      RAISE EXCEPTION 'Issued commercial and fiscal content is immutable' USING ERRCODE = '23514'; END IF;
    SELECT coalesce(sum(amount),0), max(paid_at) INTO received,last_payment FROM public.payments WHERE organization_id = NEW.organization_id AND invoice_id = NEW.id AND status = 'completed';
    SELECT coalesce(sum(total),0) INTO credited FROM public.credit_notes WHERE organization_id = NEW.organization_id AND original_invoice_id = NEW.id AND status = 'issued';
    -- Verify derived fields only when changed, retaining legacy data untouched.
    IF ROW(NEW.status,NEW.amount_paid,NEW.amount_due,NEW.amount_credited,NEW.customer_credit,NEW.paid_at)
       IS DISTINCT FROM ROW(OLD.status,OLD.amount_paid,OLD.amount_due,OLD.amount_credited,OLD.customer_credit,OLD.paid_at) THEN
      expected_status := CASE WHEN received > 0 THEN CASE WHEN received >= NEW.total - credited THEN 'paid' ELSE 'partially_paid' END
        WHEN OLD.status IN ('paid','partially_paid') THEN 'issued' ELSE OLD.status::text END;
      IF NEW.amount_paid <> received OR NEW.amount_credited <> credited
         OR NEW.amount_due <> greatest(NEW.total - credited - received,0)
         OR NEW.customer_credit <> greatest(received + credited - NEW.total,0)
         OR NEW.status::text <> expected_status
         OR NEW.paid_at IS DISTINCT FROM (CASE WHEN expected_status = 'paid' THEN last_payment ELSE NULL END) THEN
        RAISE EXCEPTION 'Financial state must match the receipt and correction ledger' USING ERRCODE = '23514'; END IF;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'draft' AND NEW.status IN ('issued','cancelled')) THEN
    RAISE EXCEPTION 'Unsupported invoice transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER zz_invoices_financial_state BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.harden_invoice_financial_state();
--> statement-breakpoint
CREATE FUNCTION public.protect_payment_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'completed' THEN RAISE EXCEPTION 'New receipt must be completed' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status <> 'completed' OR NEW.status <> 'cancelled'
       OR (to_jsonb(NEW) - ARRAY['status','cancelled_at','cancelled_by_user_id','cancellation_reason','updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','cancelled_at','cancelled_by_user_id','cancellation_reason','updated_at']) THEN
      RAISE EXCEPTION 'Payment history permits only explicit cancellation' USING ERRCODE = '23514'; END IF;
    IF NEW.cancelled_by_user_id::text IS DISTINCT FROM current_setting('first_ai.actor_user',true) THEN
      RAISE EXCEPTION 'Payment correction actor mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_history_immutable BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.protect_payment_history();
--> statement-breakpoint
CREATE FUNCTION public.record_financial_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE kind text; event text; data jsonb;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    kind := 'payment'; event := CASE WHEN TG_OP = 'INSERT' THEN 'payment.recorded' ELSE 'payment.cancelled' END;
    data := jsonb_build_object('invoiceId',NEW.invoice_id,'amount',NEW.amount::text,'to',NEW.status::text);
    IF TG_OP = 'INSERT' AND NEW.created_by_user_id::text IS DISTINCT FROM current_setting('first_ai.actor_user',true) THEN
      RAISE EXCEPTION 'Payment creator mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'credit_notes' THEN
    kind := 'credit_note';
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    event := CASE WHEN NEW.status = 'issued' THEN 'credit_note.issued' ELSE 'credit_note.cancelled' END;
    data := jsonb_build_object('invoiceId',NEW.original_invoice_id,'number',NEW.number,'amount',NEW.total::text,'from',OLD.status::text,'to',NEW.status::text);
  ELSE
    kind := 'invoice';
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      event := CASE WHEN OLD.status = 'draft' AND NEW.status = 'issued' THEN 'invoice.issued' WHEN NEW.status = 'cancelled' THEN 'invoice.cancelled' ELSE 'invoice.status_changed' END;
      data := jsonb_build_object('number',NEW.invoice_number,'from',OLD.status::text,'to',NEW.status::text,'amountPaid',NEW.amount_paid::text,'amountDue',NEW.amount_due::text,'amountCredited',NEW.amount_credited::text,'customerCredit',NEW.customer_credit::text);
    END IF;
    IF NEW.internal_notes IS DISTINCT FROM OLD.internal_notes THEN
      INSERT INTO public.financial_audit_events(organization_id,entity_type,entity_id,event_type,actor_user_id,correlation_id,metadata)
      VALUES(NEW.organization_id,kind,NEW.id,'invoice.metadata_changed',nullif(current_setting('first_ai.actor_user',true),'')::uuid,nullif(current_setting('first_ai.correlation',true),'')::uuid,jsonb_build_object('fields',jsonb_build_array('internalNotes')));
    END IF;
    IF event IS NULL THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.financial_audit_events(organization_id,entity_type,entity_id,event_type,actor_user_id,correlation_id,metadata)
  VALUES(NEW.organization_id,kind,NEW.id,event,nullif(current_setting('first_ai.actor_user',true),'')::uuid,nullif(current_setting('first_ai.correlation',true),'')::uuid,data);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER zz_invoice_audit AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.record_financial_mutation();
--> statement-breakpoint
CREATE TRIGGER zz_credit_note_audit AFTER UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.record_financial_mutation();
--> statement-breakpoint
CREATE TRIGGER zz_payment_audit AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.record_financial_mutation();
--> statement-breakpoint
-- Neither Supabase users nor service-role can invoke helper functions as RPCs.
REVOKE ALL ON FUNCTION public.guard_financial_audit(), public.protect_financial_delete(), public.protect_invoice_item(), public.harden_invoice_financial_state(), public.protect_payment_history(), public.record_financial_mutation() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER financial_audit_no_truncate BEFORE TRUNCATE ON public.financial_audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER invoices_no_truncate BEFORE TRUNCATE ON public.invoices FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER invoice_items_no_truncate BEFORE TRUNCATE ON public.invoice_items FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER credit_notes_no_truncate BEFORE TRUNCATE ON public.credit_notes FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER credit_items_no_truncate BEFORE TRUNCATE ON public.credit_note_items FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
--> statement-breakpoint
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON public.payments FOR EACH STATEMENT EXECUTE FUNCTION public.protect_financial_delete();
