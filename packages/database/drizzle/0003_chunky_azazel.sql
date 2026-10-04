CREATE TYPE "public"."lead_source" AS ENUM('website', 'phone', 'google_ads', 'referral', 'outbound', 'tender', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('fixed', 'hourly', 'unit', 'custom', 'subscription');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "lead_source" DEFAULT 'manual' NOT NULL,
	"type" varchar(80),
	"company_name" varchar(255),
	"first_name" varchar(120),
	"last_name" varchar(120),
	"email" varchar(320),
	"phone" varchar(32),
	"address_line1" varchar(255),
	"address_line2" varchar(255),
	"postal_code" varchar(20),
	"city" varchar(120),
	"country" varchar(2) DEFAULT 'FR' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"assigned_user_id" uuid,
	"estimated_value" numeric(12, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leads_score_range_check" CHECK ("leads"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(120),
	"description" text,
	"pricing_mode" "pricing_mode" NOT NULL,
	"base_price" numeric(12, 2),
	"estimated_duration_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "services_organization_id_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_organization_fk" FOREIGN KEY ("assigned_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_organization_id_idx" ON "leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leads_organization_status_created_at_idx" ON "leads" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "leads_score_idx" ON "leads" USING btree ("score");--> statement-breakpoint
CREATE INDEX "leads_assigned_user_id_idx" ON "leads" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "services_organization_id_idx" ON "services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category");--> statement-breakpoint
CREATE INDEX "services_active_idx" ON "services" USING btree ("active");--> statement-breakpoint
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON TABLE public.leads, public.services TO authenticated;--> statement-breakpoint
CREATE POLICY "leads_select_own_organization"
ON public.leads
FOR SELECT
TO authenticated
USING (organization_id = public.current_organization_id());--> statement-breakpoint
CREATE POLICY "services_select_own_organization"
ON public.services
FOR SELECT
TO authenticated
USING (organization_id = public.current_organization_id());
