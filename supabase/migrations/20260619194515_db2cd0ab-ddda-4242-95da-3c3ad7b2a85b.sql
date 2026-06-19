-- Remove overly permissive cross-company admin policy on user_roles.
-- Company-scoped "Admins can {view,insert,delete} company user roles" policies remain
-- and already restrict admins to users within their own company.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Add explicit company-scoped UPDATE policy (was implicitly covered by the dropped ALL policy).
CREATE POLICY "Admins can update company user roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.company_id = get_user_company_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.company_id = get_user_company_id(auth.uid())
  )
);