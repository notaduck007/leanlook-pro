-- Allow users to delete their own look-aheads
CREATE POLICY "Supers can delete own look-aheads"
ON public.look_aheads
FOR DELETE
TO authenticated
USING ((company_id = get_user_company_id(auth.uid())) AND (super_id = auth.uid()));

-- Allow users to delete lookahead lines in their company
CREATE POLICY "Users can delete lookahead lines"
ON public.lookahead_lines
FOR DELETE
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));