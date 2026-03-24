
-- 1. Drop the conflicting FOR ALL policy on look_aheads
DROP POLICY IF EXISTS "Supers can manage own look-aheads" ON public.look_aheads;

-- 2. Supers can update own look-aheads
CREATE POLICY "Supers can update own look-aheads"
ON public.look_aheads FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND super_id = auth.uid())
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND super_id = auth.uid());

-- 3. Admins and PMs can update company look-aheads
CREATE POLICY "Admins and PMs can update company look-aheads"
ON public.look_aheads FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm')))
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm')));

-- 4. Drop the conflicting FOR ALL policy on lookahead_lines
DROP POLICY IF EXISTS "Users can manage lookahead lines" ON public.lookahead_lines;

-- 5. Users can update lookahead lines in company
CREATE POLICY "Users can update lookahead lines in company"
ON public.lookahead_lines FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 6. Users can update tasks in company
CREATE POLICY "Users can update tasks in company"
ON public.tasks FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));
