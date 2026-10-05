CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'written_off');--> statement-breakpoint
-- Parent unique keys must exist before their composite foreign keys are installed.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_id_customer_org_unique" UNIQUE("id","customer_id","organization_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_id_customer_org_unique" UNIQUE("id","customer_id","organization_id");--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(9, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(6, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_values_check" CHECK ("invoice_items"."quantity" > 0 and "invoice_items"."unit_price" >= 0 and "invoice_items"."tax_rate" between 0 and 100 and "invoice_items"."sort_order" between 0 and 200)
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"job_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"issued_at" timestamp with time zone,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"internal_notes" text,
	"created_by_user_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invoices_org_number_unique" UNIQUE("organization_id","invoice_number"),
	CONSTRAINT "invoices_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "invoices_dates_check" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_totals_check" CHECK ("invoices"."subtotal" >= 0 and "invoices"."tax_amount" >= 0 and "invoices"."total" = "invoices"."subtotal" + "invoices"."tax_amount"),
	CONSTRAINT "invoices_issued_check" CHECK ("invoices"."status" in ('draft', 'cancelled') or "invoices"."issued_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_org_fk" FOREIGN KEY ("invoice_id","organization_id") REFERENCES "public"."invoices"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_org_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_org_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_customer_org_fk" FOREIGN KEY ("quote_id","customer_id","organization_id") REFERENCES "public"."quotes"("id","customer_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_customer_org_fk" FOREIGN KEY ("job_id","customer_id","organization_id") REFERENCES "public"."jobs"("id","customer_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_creator_org_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agent_org_fk" FOREIGN KEY ("created_by_agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_org_invoice_order_idx" ON "invoice_items" USING btree ("organization_id","invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "invoices_org_status_due_idx" ON "invoices" USING btree ("organization_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_org_customer_idx" ON "invoices" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE POLICY "invoice_items_select_invoice" ON "invoice_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.invoices where id = invoice_items.invoice_id and organization_id = invoice_items.organization_id));--> statement-breakpoint
CREATE POLICY "invoices_select_own" ON "invoices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER','ADMIN','MANAGER','ACCOUNTANT','READ_ONLY')));
