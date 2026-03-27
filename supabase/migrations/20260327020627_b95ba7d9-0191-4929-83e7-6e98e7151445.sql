
CREATE POLICY "Users can update schedule versions"
ON public.schedule_versions
FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete schedule versions"
ON public.schedule_versions
FOR DELETE
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));
