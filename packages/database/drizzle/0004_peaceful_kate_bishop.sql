CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'timeout', 'budget_exceeded');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'active', 'disabled', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."agent_tool_call_status" AS ENUM('pending', 'running', 'completed', 'failed', 'blocked', 'waiting_approval', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."model_profile" AS ENUM('FAST', 'STANDARD', 'REASONING');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"parent_run_id" uuid,
	"triggered_by_type" varchar(40) NOT NULL,
	"triggered_by_id" uuid NOT NULL,
	"objective" text NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"iteration_count" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" numeric(14, 6),
	"final_output" jsonb,
	"error_code" varchar(80),
	"error_message" text,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "agent_runs_id_organization_agent_unique" UNIQUE("id","organization_id","agent_id"),
	CONSTRAINT "agent_runs_counters_check" CHECK ("agent_runs"."iteration_count" >= 0 and "agent_runs"."tool_call_count" >= 0 and coalesce("agent_runs"."input_tokens", 0) >= 0 and coalesce("agent_runs"."output_tokens", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"tool_name" varchar(120) NOT NULL,
	"risk_level" integer NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"status" "agent_tool_call_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" varchar(80),
	"error_message" text,
	"approval_required" boolean DEFAULT false NOT NULL,
	"approval_request_id" uuid,
	"idempotency_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tool_calls_risk_check" CHECK ("agent_tool_calls"."risk_level" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"code" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"version" varchar(40) NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"autonomy_level" integer DEFAULT 0 NOT NULL,
	"model_profile" "model_profile" DEFAULT 'STANDARD' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_organization_code_version_unique" UNIQUE("organization_id","code","version"),
	CONSTRAINT "agents_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "agents_autonomy_level_check" CHECK ("agents"."autonomy_level" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_run_id_agent_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_organization_fk" FOREIGN KEY ("agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_organization_fk" FOREIGN KEY ("parent_run_id","organization_id") REFERENCES "public"."agent_runs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_run_organization_agent_fk" FOREIGN KEY ("agent_run_id","organization_id","agent_id") REFERENCES "public"."agent_runs"("id","organization_id","agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_agent_organization_fk" FOREIGN KEY ("agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_organization_started_idx" ON "agent_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_status_idx" ON "agent_runs" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_parent_idx" ON "agent_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_correlation_idx" ON "agent_runs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_run_idx" ON "agent_tool_calls" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_agent_idx" ON "agent_tool_calls" USING btree ("agent_id");--> statement-breakpoint
CREATE POLICY "agent_runs_select_own_organization" ON "agent_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("agent_runs"."organization_id" = (select public.current_organization_id()) and "agent_runs"."triggered_by_type" = 'user' and "agent_runs"."triggered_by_id" = (select id from public.users where auth_user_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "agent_tool_calls_select_own_organization" ON "agent_tool_calls" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("agent_tool_calls"."organization_id" = (select public.current_organization_id()) and exists (select 1 from public.agent_runs where id = "agent_tool_calls"."agent_run_id"));--> statement-breakpoint
CREATE POLICY "agents_select_own_organization" ON "agents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("agents"."organization_id" = (select public.current_organization_id()));
