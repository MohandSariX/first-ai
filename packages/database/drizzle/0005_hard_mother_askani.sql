ALTER TYPE "public"."model_profile" ADD VALUE 'LOCAL_FAST';--> statement-breakpoint
ALTER TYPE "public"."model_profile" ADD VALUE 'LOCAL_STANDARD';--> statement-breakpoint
ALTER TYPE "public"."model_profile" ADD VALUE 'CLOUD_STANDARD';--> statement-breakpoint
ALTER TYPE "public"."model_profile" ADD VALUE 'CLOUD_REASONING';--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(20) DEFAULT 'HYBRID' NOT NULL,
	"ollama_base_url" varchar(200) DEFAULT 'http://127.0.0.1:11434' NOT NULL,
	"local_fast_model" varchar(120) DEFAULT 'qwen3:1.7b' NOT NULL,
	"local_standard_model" varchar(120) DEFAULT 'qwen3:4b-instruct' NOT NULL,
	"cloud_standard_model" varchar(120) DEFAULT 'gpt-5.4-mini' NOT NULL,
	"cloud_reasoning_model" varchar(120) DEFAULT 'gpt-5.4' NOT NULL,
	"fallback_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_mode_check" CHECK ("ai_settings"."mode" in ('LOCAL_ONLY', 'HYBRID', 'CLOUD_ONLY'))
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "model_profile" "model_profile";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "routing_class" varchar(40);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_reason" varchar(80);--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "ai_settings_select_own" ON "ai_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id = (select public.current_organization_id()));--> statement-breakpoint
CREATE POLICY "ai_settings_insert_admin" ON "ai_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER', 'ADMIN')));--> statement-breakpoint
CREATE POLICY "ai_settings_update_admin" ON "ai_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER', 'ADMIN'))) WITH CHECK (organization_id = (select public.current_organization_id()) and exists (select 1 from public.users where auth_user_id = (select auth.uid()) and role in ('OWNER', 'ADMIN')));