-- Allow admins to view all user_roles in their company (needed for user management)
CREATE POLICY "Admins can view company user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.company_id = get_user_company_id(auth.uid())
  )
);

-- Allow admins to delete roles in their company
CREATE POLICY "Admins can delete company user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.company_id = get_user_company_id(auth.uid())
  )
);

-- Allow admins to insert roles for users in their company
CREATE POLICY "Admins can insert company user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.company_id = get_user_company_id(auth.uid())
  )
);

-- Allow admins to update display names in their company
CREATE POLICY "Admins can update company profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND has_role(auth.uid(), 'admin'::app_role)
);