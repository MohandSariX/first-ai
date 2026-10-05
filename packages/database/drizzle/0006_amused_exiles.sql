CREATE TYPE "public"."infestation_level" AS ENUM('unknown', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."job_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'scheduled', 'confirmed', 'en_route', 'in_progress', 'completed', 'follow_up_required', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'ready', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "job_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"technician_id" uuid NOT NULL,
	"observations" text,
	"infestation_level_before" "infestation_level" DEFAULT 'unknown' NOT NULL,
	"infestation_level_after" "infestation_level" DEFAULT 'unknown' NOT NULL,
	"treatment_performed" text,
	"products_used_summary" text,
	"recommendations" text,
	"follow_up_required" boolean DEFAULT false NOT NULL,
	"follow_up_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_reports_org_job_unique" UNIQUE("organization_id","job_id"),
	CONSTRAINT "job_reports_follow_up_check" CHECK ("job_reports"."follow_up_date" is null or "job_reports"."follow_up_required")
);
--> statement-breakpoint
ALTER TABLE "job_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"quote_id" uuid,
	"service_id" uuid NOT NULL,
	"infestation_level" "infestation_level" DEFAULT 'unknown' NOT NULL,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"priority" "job_priority" DEFAULT 'normal' NOT NULL,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"assigned_user_id" uuid,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"estimated_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(14, 2),
	"estimated_margin" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual_margin" numeric(14, 2),
	"description" text NOT NULL,
	"internal_notes" text,
	"customer_notes" text,
	"created_by_user_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "jobs_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "jobs_quote_org_unique" UNIQUE("quote_id","organization_id"),
	CONSTRAINT "jobs_amounts_check" CHECK ("jobs"."price" >= 0 and "jobs"."estimated_cost" >= 0 and ("jobs"."actual_cost" is null or "jobs"."actual_cost" >= 0) and "jobs"."estimated_margin" = "jobs"."price" - "jobs"."estimated_cost"),
	CONSTRAINT "jobs_schedule_check" CHECK (("jobs"."scheduled_start" is null and "jobs"."scheduled_end" is null) or ("jobs"."scheduled_start" is not null and "jobs"."scheduled_end" is not null and "jobs"."scheduled_end" > "jobs"."scheduled_start"))
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(9, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(6, 3) NOT NULL,
	"cost_estimate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_items_values_check" CHECK ("quote_items"."quantity" > 0 and "quote_items"."unit_price" >= 0 and "quote_items"."cost_estimate" >= 0 and "quote_items"."tax_rate" between 0 and 100 and "quote_items"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"quote_number" varchar(40) NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"estimated_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"estimated_margin" numeric(14, 2) DEFAULT '0' NOT NULL,
	"estimated_margin_rate" numeric(24, 3),
	"valid_until" date,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotes_org_number_unique" UNIQUE("organization_id","quote_number"),
	CONSTRAINT "quotes_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "quotes_id_customer_site_org_unique" UNIQUE("id","customer_id","site_id","organization_id"),
	CONSTRAINT "quotes_amounts_check" CHECK ("quotes"."subtotal" >= 0 and "quotes"."tax_amount" >= 0 and "quotes"."estimated_cost" >= 0 and "quotes"."total" = "quotes"."subtotal" + "quotes"."tax_amount" and "quotes"."estimated_margin" = "quotes"."subtotal" - "quotes"."estimated_cost")
);
--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_id_customer_org_unique" UNIQUE("id","customer_id","organization_id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_id_org_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_job_org_fk" FOREIGN KEY ("job_id","organization_id") REFERENCES "public"."jobs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_technician_org_fk" FOREIGN KEY ("technician_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_org_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_customer_org_fk" FOREIGN KEY ("site_id","customer_id","organization_id") REFERENCES "public"."customer_sites"("id","customer_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_quote_customer_site_org_fk" FOREIGN KEY ("quote_id","customer_id","site_id","organization_id") REFERENCES "public"."quotes"("id","customer_id","site_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_service_org_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assignee_org_fk" FOREIGN KEY ("assigned_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_creator_org_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_agent_org_fk" FOREIGN KEY ("created_by_agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_org_fk" FOREIGN KEY ("quote_id","organization_id") REFERENCES "public"."quotes"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_service_org_fk" FOREIGN KEY ("service_id","organization_id") REFERENCES "public"."services"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_org_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_site_customer_org_fk" FOREIGN KEY ("site_id","customer_id","organization_id") REFERENCES "public"."customer_sites"("id","customer_id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_creator_org_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_agent_org_fk" FOREIGN KEY ("created_by_agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_org_schedule_idx" ON "jobs" USING btree ("organization_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "jobs_org_assignee_idx" ON "jobs" USING btree ("organization_id","assigned_user_id");--> statement-breakpoint
CREATE INDEX "quote_items_org_quote_order_idx" ON "quote_items" USING btree ("organization_id","quote_id","sort_order");--> statement-breakpoint
CREATE INDEX "quotes_org_status_created_idx" ON "quotes" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "quotes_org_customer_idx" ON "quotes" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE POLICY "job_reports_select_job" ON "job_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.jobs where id = job_reports.job_id and organization_id = job_reports.organization_id) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role <> 'ACCOUNTANT'));--> statement-breakpoint
CREATE POLICY "jobs_select_own" ON "jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and (role <> 'TECHNICIAN' or id = jobs.assigned_user_id)));--> statement-breakpoint
CREATE POLICY "quote_items_select_quote" ON "quote_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.quotes where id = quote_items.quote_id and organization_id = quote_items.organization_id));--> statement-breakpoint
CREATE POLICY "quotes_select_own" ON "quotes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()) and deleted_at is null and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role <> 'TECHNICIAN'));
