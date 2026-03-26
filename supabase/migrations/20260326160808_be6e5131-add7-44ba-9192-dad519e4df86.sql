
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.subcontractor_status AS ENUM ('active', 'inactive', 'suspended', 'pending');

CREATE TABLE public.subcontractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  trade TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  license_number TEXT,
  insurance_expiration DATE,
  status subcontractor_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_subcontractors_company_name ON public.subcontractors USING gin (company_name gin_trgm_ops);
CREATE INDEX idx_subcontractors_company_id ON public.subcontractors (company_id);

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company subcontractors"
  ON public.subcontractors FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert company subcontractors"
  ON public.subcontractors FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update company subcontractors"
  ON public.subcontractors FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete company subcontractors"
  ON public.subcontractors FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER update_subcontractors_updated_at
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.subcontractors;
