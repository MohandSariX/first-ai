CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'card', 'cash', 'cheque', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"reference" varchar(200) DEFAULT '' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_cancellation_check" CHECK (("payments"."status" = 'completed' and "payments"."cancelled_at" is null and "payments"."cancelled_by_user_id" is null and "payments"."cancellation_reason" is null) or ("payments"."status" = 'cancelled' and "payments"."cancelled_at" is not null and "payments"."cancelled_by_user_id" is not null and "payments"."cancellation_reason" is not null and length(trim("payments"."cancellation_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_due" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
-- Existing invoices had no payment ledger. Never invent historical receipts.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE status IN ('paid', 'partially_paid')) THEN
    RAISE EXCEPTION 'Historical paid invoices require explicit reconciliation before payment tracking migration';
  END IF;
END $$;--> statement-breakpoint
UPDATE "invoices" SET "amount_due" = "total";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_customer_org_unique" UNIQUE("id","customer_id","organization_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_customer_org_fk" FOREIGN KEY ("invoice_id","customer_id","organization_id") REFERENCES "public"."invoices"("id","customer_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_creator_org_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_canceller_org_fk" FOREIGN KEY ("cancelled_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_org_invoice_date_idx" ON "payments" USING btree ("organization_id","invoice_id","paid_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balance_check" CHECK ("invoices"."amount_paid" >= 0 and "invoices"."amount_due" >= 0 and "invoices"."amount_paid" + "invoices"."amount_due" = "invoices"."total");--> statement-breakpoint
CREATE POLICY "payments_select_invoice" ON "payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = payments.invoice_id and organization_id = payments.organization_id));
