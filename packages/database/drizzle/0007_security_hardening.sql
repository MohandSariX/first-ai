-- Membership is authoritative, including revocation while an Auth JWT is still
-- valid. Bypass users/organizations RLS only for this fixed auth.uid() lookup;
-- no caller-supplied tenant/identity and no recursive users policy evaluation.
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.organization_id
  FROM public.users AS membership
  JOIN public.organizations AS organization ON organization.id = membership.organization_id
  WHERE membership.auth_user_id = (SELECT auth.uid())
    AND membership.status = 'active'
    AND membership.deleted_at IS NULL
    AND organization.status = 'active'
    AND organization.deleted_at IS NULL
  LIMIT 1
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;--> statement-breakpoint

-- Match leads.read in packages/auth/src/permissions.ts. The users SELECT policy
-- invokes only the narrow definer helper above, never leads: no recursive RLS.
-- Keep the existing policy name; no parallel permissive tenant-only policy.
ALTER POLICY leads_select_own_organization ON public.leads
USING (
  organization_id = (SELECT public.current_organization_id())
  AND EXISTS (
    SELECT 1 FROM public.users AS membership
    WHERE membership.auth_user_id = (SELECT auth.uid())
      AND membership.organization_id = leads.organization_id
      AND membership.status = 'active'
      AND membership.deleted_at IS NULL
      AND membership.role IN ('OWNER', 'ADMIN', 'MANAGER', 'READ_ONLY')
  )
);
