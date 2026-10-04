-- Supabase grants new public functions to API roles by default. Keep the
-- tenant lookup callable only from authenticated policies.
REVOKE EXECUTE ON FUNCTION "public"."current_organization_id"() FROM "anon";
