ALTER TABLE "contacts" DROP CONSTRAINT "contacts_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_sites" DROP CONSTRAINT "customer_sites_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_sites" DROP CONSTRAINT "customer_sites_primary_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_organization_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_customer_organization_fk" FOREIGN KEY ("customer_id","organization_id") REFERENCES "public"."customers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_primary_contact_organization_fk" FOREIGN KEY ("primary_contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Resolve tenant membership from the authenticated identity without recursively
-- evaluating the users table policy. The empty search_path prevents object shadowing.
CREATE OR REPLACE FUNCTION "public"."current_organization_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "organization_id"
  FROM "public"."users"
  WHERE "auth_user_id" = (SELECT "auth"."uid"())
    AND "deleted_at" IS NULL
  LIMIT 1
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."current_organization_id"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."current_organization_id"() TO "authenticated";--> statement-breakpoint

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."customer_sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

GRANT SELECT ON TABLE "public"."organizations" TO "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."users" TO "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."customers" TO "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."contacts" TO "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."customer_sites" TO "authenticated";--> statement-breakpoint

CREATE POLICY "organizations_select_own"
ON "public"."organizations"
FOR SELECT
TO "authenticated"
USING ("id" = (SELECT "public"."current_organization_id"()));--> statement-breakpoint

CREATE POLICY "users_select_own_organization"
ON "public"."users"
FOR SELECT
TO "authenticated"
USING ("organization_id" = (SELECT "public"."current_organization_id"()));--> statement-breakpoint

CREATE POLICY "customers_select_own_organization"
ON "public"."customers"
FOR SELECT
TO "authenticated"
USING ("organization_id" = (SELECT "public"."current_organization_id"()));--> statement-breakpoint

CREATE POLICY "contacts_select_own_organization"
ON "public"."contacts"
FOR SELECT
TO "authenticated"
USING ("organization_id" = (SELECT "public"."current_organization_id"()));--> statement-breakpoint

CREATE POLICY "customer_sites_select_own_organization"
ON "public"."customer_sites"
FOR SELECT
TO "authenticated"
USING ("organization_id" = (SELECT "public"."current_organization_id"()));
