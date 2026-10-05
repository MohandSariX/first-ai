CREATE TYPE "public"."billing_classification" AS ENUM('professional', 'individual', 'public');--> statement-breakpoint
CREATE TYPE "public"."fiscal_territory" AS ENUM('domestic', 'eu', 'international');--> statement-breakpoint
CREATE TYPE "public"."legal_entity_type" AS ENUM('company', 'individual_entrepreneur', 'association', 'public');--> statement-breakpoint
CREATE TYPE "public"."operation_category" AS ENUM('services', 'goods', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."invoice_transaction_type" AS ENUM('B2B', 'B2C', 'B2G');--> statement-breakpoint
CREATE TYPE "public"."vat_regime" AS ENUM('normal', 'franchise', 'exempt');--> statement-breakpoint
CREATE TYPE "public"."vat_treatment" AS ENUM('normal', 'franchise', 'exemption', 'reverse_charge', 'other');--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_classification" "billing_classification";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_name" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_legal_name" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_address_line1" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_address_line2" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_city" varchar(120);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_country" varchar(2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "establishment_country" varchar(2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "taxable_person" boolean;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "siren" varchar(9);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "legal_entity_type" "legal_entity_type";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "legal_form" varchar(80);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "siren" varchar(9);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "registration" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "share_capital" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "vat_regime" "vat_regime";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "vat_on_debits" boolean;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "company_size" varchar(16);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "transaction_type" "invoice_transaction_type";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "operation_category" "operation_category";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fiscal_territory" "fiscal_territory";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_treatment" "vat_treatment";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_billing_identity_check" CHECK (("customers"."siren" is null or "customers"."siren" ~ '^[0-9]{9}$') and ("customers"."siren" is null or "customers"."siret" is null or left("customers"."siret", 9) = "customers"."siren") and ("customers"."billing_country" is null or "customers"."billing_country" ~ '^[A-Z]{2}$') and ("customers"."establishment_country" is null or "customers"."establishment_country" ~ '^[A-Z]{2}$'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_fiscal_identity_check" CHECK (("organizations"."siren" is null or "organizations"."siren" ~ '^[0-9]{9}$') and ("organizations"."siren" is null or "organizations"."siret" is null or left("organizations"."siret", 9) = "organizations"."siren") and ("organizations"."share_capital" is null or "organizations"."share_capital" >= 0) and ("organizations"."company_size" is null or "organizations"."company_size" in ('micro','sme','eti','large')));
--> statement-breakpoint
-- Preserve historical v1 snapshots verbatim; all new issues capture explicit v2 identities/classification.
CREATE OR REPLACE FUNCTION public.protect_invoice_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
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
      RAISE EXCEPTION 'Invoice issue requires an atomic snapshot' USING ERRCODE = '23514';
    END IF;
    IF (NEW.document_snapshot->>'version' = '2'
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
