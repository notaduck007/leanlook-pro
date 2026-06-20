CREATE TABLE public.corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lookahead_line_id uuid REFERENCES public.lookahead_lines(id) ON DELETE SET NULL,
  variance_reason text,
  root_cause text,
  action text NOT NULL,
  owner_name text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corrective_actions TO authenticated;
GRANT ALL ON public.corrective_actions TO service_role;

ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company corrective actions"
  ON public.corrective_actions FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert company corrective actions"
  ON public.corrective_actions FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update company corrective actions"
  ON public.corrective_actions FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete company corrective actions"
  ON public.corrective_actions FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_corrective_actions_project_id ON public.corrective_actions(project_id);
CREATE INDEX idx_corrective_actions_status ON public.corrective_actions(status);
CREATE INDEX idx_corrective_actions_lookahead_line_id ON public.corrective_actions(lookahead_line_id);

CREATE TRIGGER corrective_actions_updated_at
  BEFORE UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();