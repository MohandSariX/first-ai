CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'executed', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"specialist" varchar(40) NOT NULL,
	"action" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"state_fingerprint" varchar(64) NOT NULL,
	"risk_level" integer DEFAULT 1 NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"result" jsonb,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_risk_check" CHECK ("approval_requests"."risk_level" = 1)
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approvals_requester_tenant_fk" FOREIGN KEY ("requested_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approvals_resolver_tenant_fk" FOREIGN KEY ("resolved_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approvals_run_tenant_fk" FOREIGN KEY ("agent_run_id","organization_id") REFERENCES "public"."agent_runs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_requester_created_idx" ON "approval_requests" USING btree ("organization_id","requested_by_user_id","created_at");--> statement-breakpoint
CREATE POLICY "approvals_select_own" ON "approval_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("approval_requests"."organization_id" = (select public.current_organization_id()) and "approval_requests"."requested_by_user_id" = (select id from public.users where auth_user_id = (select auth.uid())));