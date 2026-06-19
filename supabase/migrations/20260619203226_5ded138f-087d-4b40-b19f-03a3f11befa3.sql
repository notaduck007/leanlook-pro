
DROP POLICY IF EXISTS "Users can update lookahead lines in company" ON public.lookahead_lines;
DROP POLICY IF EXISTS "Users can delete lookahead lines" ON public.lookahead_lines;

CREATE POLICY "Users can update editable lookahead lines"
  ON public.lookahead_lines FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.look_aheads la
      WHERE la.id = lookahead_lines.lookahead_id
        AND la.status NOT IN ('submitted', 'approved')
        AND (
          la.super_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'pm'::public.app_role)
        )
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.look_aheads la
      WHERE la.id = lookahead_lines.lookahead_id
        AND la.status NOT IN ('submitted', 'approved')
        AND (
          la.super_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'pm'::public.app_role)
        )
    )
  );

CREATE POLICY "Users can delete editable lookahead lines"
  ON public.lookahead_lines FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.look_aheads la
      WHERE la.id = lookahead_lines.lookahead_id
        AND la.status NOT IN ('submitted', 'approved')
        AND (
          la.super_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'pm'::public.app_role)
        )
    )
  );
