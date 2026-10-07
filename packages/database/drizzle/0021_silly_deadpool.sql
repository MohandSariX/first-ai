CREATE TABLE "financial_archive_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "financial_export_check" CHECK ("financial_archive_exports"."period_from" <= "financial_archive_exports"."period_to" and "financial_archive_exports"."sha256" ~ '^[0-9a-f]{64}$' and "financial_archive_exports"."byte_size" between 1 and 104857600)
);
--> statement-breakpoint
ALTER TABLE "financial_archive_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "financial_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" uuid NOT NULL,
	"artifact_type" varchar(24) DEFAULT 'original_issued_pdf' NOT NULL,
	"document_number" varchar(32) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"renderer_version" varchar(64) NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"policy" jsonb,
	"accounting_close" date,
	"retention_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_artifact_document_unique" UNIQUE("organization_id","entity_type","entity_id"),
	CONSTRAINT "financial_artifact_check" CHECK ("financial_artifacts"."entity_type" in ('invoice','credit_note') and "financial_artifacts"."artifact_type" = 'original_issued_pdf' and "financial_artifacts"."sha256" ~ '^[0-9a-f]{64}$' and "financial_artifacts"."byte_size" between 1 and 20971520 and (("financial_artifacts"."policy" is null and "financial_artifacts"."accounting_close" is null and "financial_artifacts"."retention_until" is null) or ("financial_artifacts"."policy" is not null and "financial_artifacts"."accounting_close" is not null and "financial_artifacts"."retention_until" >= "financial_artifacts"."accounting_close")))
);
--> statement-breakpoint
ALTER TABLE "financial_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "financial_retention_policies" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"closing_month" integer NOT NULL,
	"closing_day" integer NOT NULL,
	"retention_years" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_retention_policy_check" CHECK ("financial_retention_policies"."closing_month" between 1 and 12 and "financial_retention_policies"."closing_day" between 1 and 31 and "financial_retention_policies"."retention_years" between 10 and 50 and "financial_retention_policies"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "financial_retention_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_audit_events" DROP CONSTRAINT "financial_audit_event_check";--> statement-breakpoint
ALTER TABLE "financial_archive_exports" ADD CONSTRAINT "financial_archive_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_artifacts" ADD CONSTRAINT "financial_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_retention_policies" ADD CONSTRAINT "financial_retention_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_events" ADD CONSTRAINT "financial_audit_event_check" CHECK ("financial_audit_events"."event_type" in ('invoice.issued','invoice.cancelled','invoice.status_changed','invoice.metadata_changed','credit_note.issued','credit_note.cancelled','payment.recorded','payment.cancelled','billing.seller_changed','billing.customer_changed','billing.terms_changed','invoice.artifact_persisted','credit_note.artifact_persisted','billing.retention_changed','billing.archive_exported','billing.archive_verified'));--> statement-breakpoint
CREATE POLICY "financial_export_select_own" ON "financial_archive_exports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT')));--> statement-breakpoint
CREATE POLICY "financial_artifact_select_own" ON "financial_artifacts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT','READ_ONLY')));--> statement-breakpoint
CREATE POLICY "retention_policy_select_own" ON "financial_retention_policies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT')));
--> statement-breakpoint
-- No purge workflow: retain even after the deadline. M5A guards remain unchanged.
CREATE FUNCTION public.guard_retention_record() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor_role text; parent_number text; parent_date date; parent_time timestamptz; p public.financial_retention_policies%ROWTYPE; close_date date; policy_json jsonb;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'financial_retention_policies') THEN
    RAISE EXCEPTION 'Financial archives cannot be overwritten or purged' USING ERRCODE = '23514'; END IF;
  SELECT u.role::text INTO actor_role FROM public.users u JOIN public.organizations o ON o.id=u.organization_id
  WHERE u.id::text = current_setting('first_ai.actor_user',true) AND u.auth_user_id::text = current_setting('first_ai.actor_auth',true)
    AND u.organization_id = NEW.organization_id AND u.organization_id::text = current_setting('first_ai.actor_org',true)
    AND u.status='active' AND u.deleted_at IS NULL AND o.status='active' AND o.deleted_at IS NULL FOR SHARE OF u,o;
  IF actor_role IS NULL OR actor_role NOT IN ('OWNER','ADMIN','MANAGER','ACCOUNTANT') THEN
    RAISE EXCEPTION 'Trusted active financial actor required' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME = 'financial_retention_policies' THEN
    IF actor_role NOT IN ('OWNER','ADMIN') THEN RAISE EXCEPTION 'Retention configuration denied' USING ERRCODE='23514'; END IF;
    PERFORM make_date(2001,NEW.closing_month,NEW.closing_day);
    IF TG_OP='UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.version <> OLD.version+1) THEN
      RAISE EXCEPTION 'Retention version/tenant immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'financial_artifacts' THEN
    IF NEW.entity_type='invoice' THEN
      SELECT invoice_number,issue_date,issued_at INTO parent_number,parent_date,parent_time FROM public.invoices WHERE id=NEW.entity_id AND organization_id=NEW.organization_id FOR UPDATE;
    ELSE
      SELECT number,issue_date,issued_at INTO parent_number,parent_date,parent_time FROM public.credit_notes WHERE id=NEW.entity_id AND organization_id=NEW.organization_id AND status='issued' FOR UPDATE;
    END IF;
    IF parent_time IS NULL OR parent_number IS DISTINCT FROM NEW.document_number OR parent_time IS DISTINCT FROM NEW.generated_at THEN
      RAISE EXCEPTION 'Artifact requires issued document of same tenant' USING ERRCODE='23514'; END IF;
    -- Only in the original issuance transaction. Never fabricate a legacy original later.
    IF NOT EXISTS (SELECT 1 FROM public.financial_audit_events WHERE organization_id=NEW.organization_id AND entity_id=NEW.entity_id
      AND event_type=NEW.entity_type||'.issued' AND correlation_id::text=current_setting('first_ai.correlation',true)) THEN
      RAISE EXCEPTION 'Original artifact must be captured during issuance' USING ERRCODE='23514'; END IF;
    SELECT * INTO p FROM public.financial_retention_policies WHERE organization_id=NEW.organization_id FOR SHARE;
    IF p.organization_id IS NULL THEN
      IF NEW.policy IS NOT NULL OR NEW.accounting_close IS NOT NULL OR NEW.retention_until IS NOT NULL THEN
        RAISE EXCEPTION 'Unknown retention policy cannot be invented' USING ERRCODE='23514'; END IF;
    ELSE
      policy_json := jsonb_build_object('closingMonth',p.closing_month,'closingDay',p.closing_day,'retentionYears',p.retention_years,'version',p.version);
      close_date := make_date(extract(year from parent_date)::integer,p.closing_month,p.closing_day);
      IF parent_date > close_date THEN close_date := make_date(extract(year from parent_date)::integer+1,p.closing_month,p.closing_day); END IF;
      IF NEW.policy IS DISTINCT FROM policy_json OR NEW.accounting_close IS DISTINCT FROM close_date OR NEW.retention_until IS DISTINCT FROM (close_date+make_interval(years=>p.retention_years))::date THEN
        RAISE EXCEPTION 'Retention deadline must derive from accounting close' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.storage_key <> NEW.organization_id::text||'/'||NEW.entity_type||'/'||NEW.entity_id::text||'/'||NEW.sha256||'.pdf' THEN
      RAISE EXCEPTION 'Invalid controlled artifact key' USING ERRCODE='23514'; END IF;
  ELSE
    IF actor_role NOT IN ('OWNER','ADMIN','ACCOUNTANT') OR NEW.storage_key <> NEW.organization_id::text||'/export/'||NEW.id::text||'/'||NEW.sha256||'.json' THEN
      RAISE EXCEPTION 'Archive export denied or invalid key' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_artifacts_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_artifacts FOR EACH ROW EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE TRIGGER financial_exports_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_archive_exports FOR EACH ROW EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE TRIGGER financial_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON public.financial_retention_policies FOR EACH ROW EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE TRIGGER financial_artifacts_no_truncate BEFORE TRUNCATE ON public.financial_artifacts FOR EACH STATEMENT EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE TRIGGER financial_exports_no_truncate BEFORE TRUNCATE ON public.financial_archive_exports FOR EACH STATEMENT EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE TRIGGER financial_policy_no_truncate BEFORE TRUNCATE ON public.financial_retention_policies FOR EACH STATEMENT EXECUTE FUNCTION public.guard_retention_record();
--> statement-breakpoint
CREATE FUNCTION public.audit_artifact_persisted() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.financial_audit_events(organization_id,entity_type,entity_id,event_type,actor_user_id,correlation_id,metadata)
    VALUES(NEW.organization_id,NEW.entity_type,NEW.entity_id,NEW.entity_type||'.artifact_persisted',current_setting('first_ai.actor_user')::uuid,current_setting('first_ai.correlation')::uuid,jsonb_build_object('number',NEW.document_number));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_artifact_audit AFTER INSERT ON public.financial_artifacts FOR EACH ROW EXECUTE FUNCTION public.audit_artifact_persisted();
--> statement-breakpoint
CREATE FUNCTION public.verify_issue_original_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_artifacts WHERE organization_id=NEW.organization_id AND entity_id=NEW.id AND entity_type=(CASE WHEN TG_TABLE_NAME='invoices' THEN 'invoice' ELSE 'credit_note' END)) THEN
    RAISE EXCEPTION 'Issuance must commit with preserved original artifact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_original_atomic AFTER UPDATE ON public.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status='draft' AND NEW.status='issued') EXECUTE FUNCTION public.verify_issue_original_commit();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER credit_original_atomic AFTER UPDATE ON public.credit_notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status='draft' AND NEW.status='issued') EXECUTE FUNCTION public.verify_issue_original_commit();
--> statement-breakpoint
CREATE FUNCTION public.guard_archive_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor_role text;
BEGIN
  IF NEW.event_type IN ('billing.retention_changed','billing.archive_exported','billing.archive_verified') THEN
    SELECT role::text INTO actor_role FROM public.users WHERE id=NEW.actor_user_id AND organization_id=NEW.organization_id;
    IF NEW.entity_type <> 'organization' OR NEW.entity_id <> NEW.organization_id
      OR (NEW.event_type='billing.retention_changed' AND actor_role NOT IN ('OWNER','ADMIN'))
      OR (NEW.event_type IN ('billing.archive_exported','billing.archive_verified') AND actor_role NOT IN ('OWNER','ADMIN','ACCOUNTANT')) THEN
      RAISE EXCEPTION 'Archive audit authority denied' USING ERRCODE='23514'; END IF;
    IF NEW.event_type <> 'billing.retention_changed' AND NOT EXISTS (SELECT 1 FROM public.financial_archive_exports WHERE id=(NEW.metadata->>'number')::uuid AND organization_id=NEW.organization_id) THEN
      RAISE EXCEPTION 'Archive event resource invalid' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_archive_audit_guard BEFORE INSERT ON public.financial_audit_events FOR EACH ROW EXECUTE FUNCTION public.guard_archive_audit();
--> statement-breakpoint
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.financial_artifacts,public.financial_archive_exports,public.financial_retention_policies FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_retention_record(),public.audit_artifact_persisted(),public.verify_issue_original_commit(),public.guard_archive_audit() FROM PUBLIC,anon,authenticated,service_role;
