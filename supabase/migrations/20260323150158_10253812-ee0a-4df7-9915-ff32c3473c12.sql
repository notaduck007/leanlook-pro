
-- Fix: tighten companies insert policy
DROP POLICY "Anyone can insert companies" ON public.companies;
CREATE POLICY "Authenticated users can create companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
