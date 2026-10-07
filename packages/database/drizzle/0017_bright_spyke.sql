CREATE TYPE "public"."credit_note_status" AS ENUM('draft', 'issued', 'cancelled');--> statement-breakpoint
CREATE TABLE "credit_note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"original_invoice_id" uuid NOT NULL,
	"original_line_index" integer NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_items_note_line_unique" UNIQUE("credit_note_id","original_line_index"),
	CONSTRAINT "credit_note_items_values_check" CHECK ("credit_note_items"."original_line_index" between 0 and 199 and "credit_note_items"."subtotal" > 0 and "credit_note_items"."tax_amount" >= 0 and "credit_note_items"."total" = "credit_note_items"."subtotal" + "credit_note_items"."tax_amount")
);
--> statement-breakpoint
ALTER TABLE "credit_note_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_note_number_counters" (
	"organization_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"last_number" integer NOT NULL,
	"last_issued_at" timestamp with time zone NOT NULL,
	"last_issue_date" date NOT NULL,
	"last_credit_note_id" uuid NOT NULL,
	CONSTRAINT "credit_note_number_counters_organization_id_fiscal_year_pk" PRIMARY KEY("organization_id","fiscal_year"),
	CONSTRAINT "credit_note_counters_values_check" CHECK ("credit_note_number_counters"."fiscal_year" between 1000 and 9999 and "credit_note_number_counters"."last_number" between 1 and 999999)
);
--> statement-breakpoint
ALTER TABLE "credit_note_number_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"original_invoice_id" uuid NOT NULL,
	"number" varchar(40),
	"status" "credit_note_status" DEFAULT 'draft' NOT NULL,
	"correction_type" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"issue_date" date,
	"issued_at" timestamp with time zone,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_id_invoice_org_unique" UNIQUE("id","original_invoice_id","organization_id"),
	CONSTRAINT "credit_notes_org_number_unique" UNIQUE("organization_id","number"),
	CONSTRAINT "credit_notes_org_key_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "credit_notes_values_check" CHECK ("credit_notes"."correction_type" in ('partial','full') and length(trim("credit_notes"."reason")) > 0 and "credit_notes"."subtotal" >= 0 and "credit_notes"."tax_amount" >= 0 and "credit_notes"."total" = "credit_notes"."subtotal" + "credit_notes"."tax_amount"),
	CONSTRAINT "credit_notes_issue_check" CHECK (("credit_notes"."status" = 'issued' and "credit_notes"."number" is not null and "credit_notes"."issue_date" is not null and "credit_notes"."issued_at" is not null and "credit_notes"."snapshot" is not null) or ("credit_notes"."status" <> 'issued' and "credit_notes"."number" is null and "credit_notes"."issue_date" is null and "credit_notes"."issued_at" is null and "credit_notes"."snapshot" is null))
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_balance_check";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_credited" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_credit" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_parent_org_fk" FOREIGN KEY ("credit_note_id","original_invoice_id","organization_id") REFERENCES "public"."credit_notes"("id","original_invoice_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_number_counters" ADD CONSTRAINT "credit_note_number_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_org_fk" FOREIGN KEY ("original_invoice_id","organization_id") REFERENCES "public"."invoices"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_creator_org_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_items_org_invoice_idx" ON "credit_note_items" USING btree ("organization_id","original_invoice_id");--> statement-breakpoint
CREATE INDEX "credit_notes_org_invoice_idx" ON "credit_notes" USING btree ("organization_id","original_invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balance_check" CHECK ("invoices"."amount_paid" >= 0 and "invoices"."amount_due" >= 0 and "invoices"."customer_credit" >= 0 and "invoices"."amount_credited" between 0 and "invoices"."total" and "invoices"."total" - "invoices"."amount_credited" - "invoices"."amount_paid" = "invoices"."amount_due" - "invoices"."customer_credit" and ("invoices"."amount_due" = 0 or "invoices"."customer_credit" = 0));--> statement-breakpoint
CREATE POLICY "credit_note_items_select_parent" ON "credit_note_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.credit_notes where id = credit_note_items.credit_note_id and organization_id = credit_note_items.organization_id));--> statement-breakpoint
CREATE POLICY "credit_notes_select_invoice" ON "credit_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = credit_notes.original_invoice_id and organization_id = credit_notes.organization_id));
--> statement-breakpoint
-- M4 narrow server allocator, transactional counters rather than nextval. No RPC/client privilege.
CREATE FUNCTION public.allocate_credit_note_number(p_org uuid, p_note uuid)
RETURNS TABLE(number text, issue_date date, issued_at timestamptz, time_zone text, fiscal_year integer)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_zone text; v_at timestamptz; v_date date; v_year integer; v_number integer;
  v_last_at timestamptz; v_last_date date; v_last_year integer;
BEGIN
  PERFORM 1 FROM public.credit_notes WHERE id = p_note AND organization_id = p_org AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft credit note unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credit-fiscal:' || p_org::text, 0));
  SELECT timezone INTO v_zone FROM public.organizations WHERE id = p_org AND status = 'active' AND deleted_at IS NULL;
  IF v_zone IS NULL THEN RAISE EXCEPTION 'Active organization required' USING ERRCODE = '23514'; END IF;
  v_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  v_date := (v_at AT TIME ZONE v_zone)::date; v_year := extract(year FROM v_date)::integer;
  SELECT max(last_issued_at), max(last_issue_date), max(c.fiscal_year) INTO v_last_at, v_last_date, v_last_year
    FROM public.credit_note_number_counters c WHERE organization_id = p_org;
  IF v_at < v_last_at OR v_date < v_last_date OR v_year < v_last_year THEN RAISE EXCEPTION 'Credit chronology moved backwards' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.credit_note_number_counters AS c (organization_id,fiscal_year,last_number,last_issued_at,last_issue_date,last_credit_note_id)
    VALUES(p_org,v_year,1,v_at,v_date,p_note)
    ON CONFLICT ON CONSTRAINT credit_note_number_counters_organization_id_fiscal_year_pk DO UPDATE
      SET last_number = c.last_number + 1, last_issued_at = v_at, last_issue_date = v_date, last_credit_note_id = p_note
    RETURNING last_number INTO v_number;
  RETURN QUERY SELECT 'AV-' || v_year::text || '-' || pg_catalog.lpad(v_number::text,6,'0'), v_date,v_at,v_zone,v_year;
END; $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.allocate_credit_note_number(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION public.protect_credit_counter() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN RAISE EXCEPTION 'Credit number cannot be released' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF ROW(NEW.organization_id,NEW.fiscal_year) IS DISTINCT FROM ROW(OLD.organization_id,OLD.fiscal_year)
     OR NEW.last_number <> OLD.last_number + 1 OR NEW.last_issued_at < OLD.last_issued_at OR NEW.last_issue_date < OLD.last_issue_date THEN
    RAISE EXCEPTION 'Credit counter must advance once' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER credit_counter_monotonic BEFORE UPDATE OR DELETE ON public.credit_note_number_counters FOR EACH ROW EXECUTE FUNCTION public.protect_credit_counter();
--> statement-breakpoint
CREATE FUNCTION public.protect_credit_item() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_note uuid; v_org uuid; v_invoice uuid; v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.organization_id,NEW.credit_note_id,NEW.original_invoice_id,NEW.original_line_index) IS DISTINCT FROM ROW(OLD.organization_id,OLD.credit_note_id,OLD.original_invoice_id,OLD.original_line_index) THEN
    RAISE EXCEPTION 'Credit item identity immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN v_note := OLD.credit_note_id; v_org := OLD.organization_id; v_invoice := OLD.original_invoice_id;
  ELSE v_note := NEW.credit_note_id; v_org := NEW.organization_id; v_invoice := NEW.original_invoice_id; END IF;
  PERFORM 1 FROM public.invoices WHERE id = v_invoice AND organization_id = v_org FOR UPDATE;
  SELECT status::text INTO v_status FROM public.credit_notes WHERE id = v_note AND organization_id = v_org FOR UPDATE;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN RAISE EXCEPTION 'Issued/cancelled credit lines immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
--> statement-breakpoint
CREATE TRIGGER credit_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_items FOR EACH ROW EXECUTE FUNCTION public.protect_credit_item();
--> statement-breakpoint
CREATE FUNCTION public.protect_credit_note() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_original jsonb; v_line jsonb; v_item record; v_before numeric; v_before_tax numeric;
  v_base numeric; v_vat numeric; v_expected numeric; v_ht numeric; v_tax numeric; v_count integer; v_snapshot_line jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.number IS NOT NULL OR NEW.snapshot IS NOT NULL OR NEW.issued_at IS NOT NULL THEN RAISE EXCEPTION 'New credit must be draft' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.organization_id,NEW.original_invoice_id,NEW.created_by_user_id,NEW.idempotency_key,NEW.correction_type,NEW.reason)
    IS DISTINCT FROM ROW(OLD.organization_id,OLD.original_invoice_id,OLD.created_by_user_id,OLD.idempotency_key,OLD.correction_type,OLD.reason) THEN
    RAISE EXCEPTION 'Credit identity and reason immutable' USING ERRCODE = '23514'; END IF;
  IF OLD.status <> 'draft' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Issued/cancelled credit immutable' USING ERRCODE = '23514'; END IF;
  IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    SELECT document_snapshot INTO v_original FROM public.invoices WHERE id = NEW.original_invoice_id AND organization_id = NEW.organization_id AND issued_at IS NOT NULL AND deleted_at IS NULL AND status IN ('issued','sent','overdue','partially_paid','paid') FOR UPDATE;
    IF v_original IS NULL THEN RAISE EXCEPTION 'Original issued document required' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.credit_note_number_counters c WHERE c.organization_id = NEW.organization_id AND c.last_credit_note_id = NEW.id AND NEW.number = 'AV-' || c.fiscal_year::text || '-' || pg_catalog.lpad(c.last_number::text,6,'0') AND NEW.issue_date = c.last_issue_date AND NEW.issued_at = c.last_issued_at) THEN RAISE EXCEPTION 'Credit allocation mismatch' USING ERRCODE = '23514'; END IF;
    SELECT count(*),coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0) INTO v_count,v_ht,v_tax FROM public.credit_note_items WHERE credit_note_id = NEW.id AND organization_id = NEW.organization_id;
    IF v_count < 1 OR v_count > 200 OR NEW.subtotal <> v_ht OR NEW.tax_amount <> v_tax OR NEW.total <> v_ht + v_tax THEN RAISE EXCEPTION 'Credit totals mismatch' USING ERRCODE = '23514'; END IF;
    IF (NEW.snapshot->>'version' = '1' AND NEW.snapshot->'originalInvoice' = v_original
       AND NEW.snapshot->>'organizationId' = NEW.organization_id::text AND NEW.snapshot->>'creditNoteId' = NEW.id::text
       AND NEW.snapshot->>'number' = NEW.number AND NEW.snapshot->>'reason' = NEW.reason
       AND NEW.snapshot->>'correctionType' = NEW.correction_type AND NEW.snapshot->>'issueDate' = NEW.issue_date::text
       AND (NEW.snapshot->>'issuedAt')::timestamptz = NEW.issued_at
       AND NEW.snapshot->>'timeZone' = (SELECT timezone FROM public.organizations WHERE id = NEW.organization_id)
       AND NEW.issue_date = (NEW.issued_at AT TIME ZONE (NEW.snapshot->>'timeZone'))::date
       AND NEW.issue_date >= (v_original->'invoice'->>'issueDate')::date
       AND (NEW.snapshot->>'fiscalYear')::integer = extract(year FROM NEW.issue_date)::integer
       AND (NEW.snapshot->'totals'->>'subtotal')::numeric = v_ht AND (NEW.snapshot->'totals'->>'taxAmount')::numeric = v_tax
       AND (NEW.snapshot->'totals'->>'total')::numeric = v_ht + v_tax AND jsonb_array_length(NEW.snapshot->'lines') = v_count) IS NOT TRUE THEN RAISE EXCEPTION 'Credit snapshot mismatch' USING ERRCODE = '23514'; END IF;
    FOR v_item IN SELECT * FROM public.credit_note_items WHERE credit_note_id = NEW.id AND organization_id = NEW.organization_id LOOP
      v_line := v_original->'lines'->v_item.original_line_index;
      IF v_line IS NULL THEN RAISE EXCEPTION 'Original line absent' USING ERRCODE = '23514'; END IF;
      v_base := (v_line->>'subtotal')::numeric; v_vat := (v_line->>'taxAmount')::numeric;
      SELECT coalesce(sum(i.subtotal),0),coalesce(sum(i.tax_amount),0) INTO v_before,v_before_tax FROM public.credit_note_items i JOIN public.credit_notes n ON n.id = i.credit_note_id AND n.organization_id = i.organization_id
        WHERE i.original_invoice_id = NEW.original_invoice_id AND i.organization_id = NEW.organization_id AND i.original_line_index = v_item.original_line_index AND n.status = 'issued';
      IF v_base <= 0 OR v_before + v_item.subtotal > v_base THEN RAISE EXCEPTION 'Cumulative overcorrection' USING ERRCODE = '23514'; END IF;
      v_expected := round(v_vat * (v_before + v_item.subtotal) / v_base,2) - v_before_tax;
      IF v_item.tax_amount <> v_expected OR v_expected < 0 OR v_before_tax + v_expected > v_vat THEN RAISE EXCEPTION 'Credit VAT allocation mismatch' USING ERRCODE = '23514'; END IF;
      SELECT l INTO v_snapshot_line FROM jsonb_array_elements(NEW.snapshot->'lines') l WHERE (l->>'originalLineIndex')::integer = v_item.original_line_index;
      IF (v_snapshot_line->>'description' = v_line->>'description' AND v_snapshot_line->>'taxRate' = v_line->>'taxRate'
          AND (v_snapshot_line->>'subtotal')::numeric = v_item.subtotal AND (v_snapshot_line->>'taxAmount')::numeric = v_item.tax_amount AND (v_snapshot_line->>'total')::numeric = v_item.total) IS NOT TRUE THEN RAISE EXCEPTION 'Credit line snapshot mismatch' USING ERRCODE = '23514'; END IF;
    END LOOP;
    IF NEW.correction_type = 'full' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_original->'lines') WITH ORDINALITY l(value,pos)
      WHERE (value->>'subtotal')::numeric <> coalesce((SELECT sum(i.subtotal) FROM public.credit_note_items i JOIN public.credit_notes n ON n.id=i.credit_note_id AND n.organization_id=i.organization_id WHERE i.original_invoice_id=NEW.original_invoice_id AND i.organization_id=NEW.organization_id AND i.original_line_index=l.pos-1 AND (n.status='issued' OR n.id=NEW.id)),0)
    ) THEN RAISE EXCEPTION 'Full correction is stale/incomplete' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER credit_note_immutable BEFORE INSERT OR UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.protect_credit_note();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_credit_counter(), public.protect_credit_item(), public.protect_credit_note() FROM PUBLIC;
